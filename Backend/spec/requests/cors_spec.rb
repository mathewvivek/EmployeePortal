require "rails_helper"

RSpec.describe "API CORS policy", type: :request do
  let(:origin) { "https://employee-portal-frontend-1hdp.onrender.com" }

  it "allows API reads from the deployed frontend without enabling cookie credentials" do
    get "/api/v1/employees", headers: { "Origin" => origin }

    expect(response).to have_http_status(:ok)
    expect(response.headers["Access-Control-Allow-Origin"]).to eq(origin)
    expect(response.headers["Access-Control-Allow-Credentials"]).to be_nil
    expect(response.headers["Vary"].split(/,\s*/)).to include("Origin")
  end

  it "allows JSON employee creation from the deployed frontend" do
    post "/api/v1/employees", params: { employee: employee_attributes },
      headers: { "Origin" => origin }, as: :json

    expect(response).to have_http_status(:created)
    expect(response.headers["Access-Control-Allow-Origin"]).to eq(origin)
    expect(Employee.count).to eq(1)
  end

  %w[GET POST PUT PATCH DELETE OPTIONS].each do |method|
    it "answers #{method} preflight requests for API resources" do
      options "/api/v1/employees", headers: {
        "Origin" => origin, "Access-Control-Request-Method" => method,
        "Access-Control-Request-Headers" => "content-type, authorization"
      }

      expect(response).to have_http_status(:ok)
      expect(response.headers["Access-Control-Allow-Origin"]).to eq(origin)
      expect(response.headers["Access-Control-Allow-Methods"].split(/,\s*/)).to include(method)
      expect(response.headers["Access-Control-Allow-Headers"].downcase).to include("content-type", "authorization")
      expect(Employee.count).to eq(0)
    end
  end

  [ "https://untrusted.example", "https://salary-management-frontend.onrender.com",
    "https://employee-portal-frontend-1hdp.onrender.com.evil.example" ].each do |untrusted|
    it "does not grant browser access to #{untrusted}" do
      get "/api/v1/employees", headers: { "Origin" => untrusted }
      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil

      options "/api/v1/employees", headers: {
        "Origin" => untrusted, "Access-Control-Request-Method" => "POST"
      }
      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end
  end

  it "does not grant preflight access for methods outside the allowlist" do
    options "/api/v1/employees", headers: {
      "Origin" => origin, "Access-Control-Request-Method" => "TRACE"
    }
    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end

  it "does not apply the API CORS policy to health endpoints" do
    get "/up", headers: { "Origin" => origin }
    expect(response).to have_http_status(:ok)
    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end

  it "preserves same-origin API requests without an Origin header" do
    get "/api/v1/employees"
    expect(response).to have_http_status(:ok)
    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end
end
