require "rails_helper"

RSpec.describe "HR authentication", type: :request do
  before { Api::V1::SessionsController::LOGIN_RATE_LIMIT_STORE.clear }

  def login(email: "test.hr@example.com", password: "TestingHR!2026Access")
    post "/api/v1/session", params: { session: { email: email, password: password } }, as: :json
  end

  it "signs in an HR user and returns only public user fields plus an expiring token" do
    user = create_user
    expect { login(email: user.email.upcase) }.to change(Session, :count).by(1)
    expect(response).to have_http_status(:created)
    expect(response.headers["Cache-Control"]).to eq("no-store")
    data = json_response.fetch("data")
    expect(data.fetch("user")).to eq(user.public_attributes)
    expect(data.fetch("token")).to match(/\A[0-9a-f]{64}\z/)
    expect(data.fetch("user")).not_to have_key("password_digest")
    get "/api/v1/session", headers: { "Authorization" => "Bearer #{data.fetch('token')}" }
    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data").fetch("user")).to eq(user.public_attributes)
    expect(json_response.fetch("data")).not_to have_key("token")
  end

  it "uses the same error for incorrect passwords and unknown accounts" do
    create_user
    login(password: "wrong password")
    expect(response).to have_http_status(:unauthorized)
    error = json_response
    login(email: "unknown@example.com")
    expect(response).to have_http_status(:unauthorized)
    expect(json_response).to eq(error)
    expect(Session.count).to eq(0)
  end

  it "rejects disabled accounts and oversized passwords" do
    create_user(active: false)
    login
    expect(response).to have_http_status(:unauthorized)
    login(password: "a" * 100)
    expect(response).to have_http_status(:unauthorized)
    expect(Session.count).to eq(0)
  end

  [ {}, { session: [] }, { session: "bad" } ].each do |payload|
    it "returns JSON errors for malformed credentials #{payload.inspect}" do
      post "/api/v1/session", params: payload, as: :json
      expect(response).to have_http_status(:bad_request)
      expect(json_response.fetch("errors")).not_to be_empty
    end
  end

  it "rate-limits repeated login attempts" do
    10.times { login(email: "unknown@example.com", password: "") }
    login(email: "unknown@example.com", password: "")
    expect(response).to have_http_status(:too_many_requests)
    expect(json_response.fetch("errors").first).to include("Too many")
  end

  [ "/api/v1/employees", "/api/v1/employees/options", "/api/v1/compensation_insights", "/api/v1/salary_analysis", "/api/v1/employees/1/salary",
    "/api/v1/employees/1/salary_history", "/api/v1/session", "/api/v1/salary_data_anomalies",
    "/api/v1/salary_data_anomalies/1" ].each do |path|
    it "requires authentication to read #{path}" do
      get path
      expect(response).to have_http_status(:unauthorized)
      expect(json_response.fetch("errors")).not_to be_empty
    end
  end

  it "prevents unauthenticated scans and anomaly reviews" do
    post "/api/v1/salary_data_quality_scans"
    expect(response).to have_http_status(:unauthorized)
    expect(SalaryDataQualityScan.count).to eq(0)
    patch "/api/v1/salary_data_anomalies/1", params: { review: { status: "legitimate", notes: "Not authorized" } }, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(SalaryDataAnomalyReview.count).to eq(0)
  end

  it "prevents unauthenticated employee creation and salary changes" do
    employee = create_employee
    expect do
      post "/api/v1/employees", params: { employee: employee_attributes(employee_id: "NEW") }, as: :json
    end.not_to change(Employee, :count)
    expect(response).to have_http_status(:unauthorized)
    patch "/api/v1/employees/#{employee.id}/salary", params: { salary: { base_salary: "1", currency: "INR",
      effective_date: "2026-10-12", confirmed: true } }, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(employee.reload.base_salary.to_s("F")).to eq("60000.5")
    expect(SalaryChange.count).to eq(0)
  end

  it "prevents unauthenticated employee detail changes" do
    employee = create_employee
    previous = employee.attributes
    patch "/api/v1/employees/#{employee.id}", params: { employee: { name: "Not authorized" } }, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(employee.reload.attributes).to eq(previous)
  end

  it "rejects expired or tampered bearer tokens" do
    session, token = Session.issue!(user: create_user)
    session.update!(expires_at: 1.second.ago)
    [ token, "not-a-token" ].each do |value|
      get "/api/v1/employees", headers: { "Authorization" => "Bearer #{value}" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  it "logs out and invalidates the server session" do
    session, token = Session.issue!(user: create_user)
    headers = { "Authorization" => "Bearer #{token}" }
    delete "/api/v1/session", headers: headers
    expect(response).to have_http_status(:no_content)
    expect(Session.exists?(session.id)).to be(false)
    get "/api/v1/employees", headers: headers
    expect(response).to have_http_status(:unauthorized)
  end

  it "allows unauthenticated CORS preflights for the login endpoint" do
    options "/api/v1/session", headers: { "Origin" => "https://employee-portal-frontend-1hdp.onrender.com",
      "Access-Control-Request-Method" => "POST", "Access-Control-Request-Headers" => "content-type" }
    expect(response).to have_http_status(:ok)
    expect(response.headers["Access-Control-Allow-Origin"]).to eq("https://employee-portal-frontend-1hdp.onrender.com")
  end
end
