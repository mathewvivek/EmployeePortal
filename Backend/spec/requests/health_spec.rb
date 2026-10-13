require "rails_helper"

RSpec.describe "API health endpoints", type: :request do
  it "renders a public status page at the root without requiring sign-in" do
    get "/", headers: { "Accept" => "text/html" }

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("text/html")
    html = Nokogiri::HTML(response.body)
    expect(html.at_css("h1").text).to eq("Employee Portal API")
    expect(html.text).to include("Application online", "HR sign-in required", "Database status", "Not checked")
    expect(html.css("table")).to be_empty
    expect(html.text).not_to include("API endpoints", "API version", "Base path", "/api/v1")
    expect(html.at_css("time")["datetime"]).to match(/Z\z/)
    expect(html.at_css("time").text).to end_with("UTC")
    expect(response.headers["Cache-Control"]).to eq("no-store")
    expect(response.headers["Content-Security-Policy"]).to include("default-src 'none'", "frame-ancestors 'none'")
    expect(response.headers["Content-Security-Policy"]).to include("script-src 'self'")
    expect(response.headers["Content-Security-Policy"]).not_to include("script-src 'unsafe-inline'")
    expect(html.css("script[src='/api-status-theme.js']").size).to eq(1)
    expect(html.css("script:not([src])")).to be_empty
    expect(html.at_css("#api-theme-toggle")["aria-label"]).to eq("Switch to black theme")
  end

  %w[development production].each do |environment|
    it "keeps API route details out of the public #{environment} page" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new(environment))
      get "/", headers: { "Accept" => "text/html" }
      expect(response).to have_http_status(:ok)
      expect(response.body).not_to include("/api/v1", "API endpoints", "Bearer token", "Base path", "API version")
      html = Nokogiri::HTML(response.body)
      expect(html.at_css(".portal-link")).to be_present
      expect(html.at_css("a[href='/up']")).to be_present
      expect(html.at_css("#api-theme-toggle")).to be_present
    end
  end

  it "defaults to HTML without an Accept header" do
    get "/"
    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("text/html")
  end

  it "preserves JSON root health for automated clients" do
    get "/", headers: { "Accept" => "application/json" }
    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("application/json")
    expect(json_response.fetch("status")).to eq("up")
    expect { Time.iso8601(json_response.fetch("timestamp")) }.not_to raise_error
  end

  it "supports an explicit JSON format link" do
    get "/", params: { format: "json" }
    expect(response.media_type).to eq("application/json")
    expect(json_response.fetch("status")).to eq("up")
  end

  it "uses the local React URL outside production by default" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return(nil)
    get "/"
    expect(Nokogiri::HTML(response.body).at_css(".portal-link")["href"]).to eq("http://127.0.0.1:5173")
  end

  it "uses the deployed frontend URL in production by default" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return(nil)
    get "/"
    expect(Nokogiri::HTML(response.body).at_css(".portal-link")["href"]).to eq(ApiStatusController::PRODUCTION_FRONTEND_URL)
  end

  it "supports a configured public frontend origin" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return(" https://portal.example.com/ ")
    get "/"
    expect(Nokogiri::HTML(response.body).at_css(".portal-link")["href"]).to eq("https://portal.example.com/")
  end

  [ "javascript:alert(1)", "not a URL", "https://user:password@example.com", "https://example.com?secret=value", "https://example.com/private", "https://example.com/#secret", "http://example.com" ].each do |url|
    it "falls back safely for invalid production frontend configuration #{url.inspect}" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("FRONTEND_URL").and_return(url)
      get "/"
      expect(Nokogiri::HTML(response.body).at_css(".portal-link")["href"]).to eq(ApiStatusController::PRODUCTION_FRONTEND_URL)
    end
  end

  it "renders without reading employee records or leaking private configuration" do
    expect(Employee).not_to receive(:count)
    expect(User).not_to receive(:count)
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("HR_LOGIN_PASSWORD").and_return("private-password-sentinel")
    allow(ENV).to receive(:[]).with("RAILS_MASTER_KEY").and_return("private-key-sentinel")
    get "/"
    expect(response).to have_http_status(:ok)
    expect(response.body).not_to include("private-password-sentinel", "private-key-sentinel", "postgresql://", "employee_portal_development")
  end

  it "preserves the HTML health check used by Render" do
    get "/up"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("text/html")
  end

  it "supports JSON health checks at /up" do
    get "/up", headers: { "Accept" => "application/json" }

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("status")).to eq("up")
  end
end
