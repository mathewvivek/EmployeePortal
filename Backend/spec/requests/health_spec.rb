require "rails_helper"

RSpec.describe "API health endpoints", type: :request do
  it "returns JSON health at the root when opened in a browser" do
    get "/", headers: { "Accept" => "text/html" }

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("application/json")
    expect(json_response.fetch("status")).to eq("up")
    expect { Time.iso8601(json_response.fetch("timestamp")) }.not_to raise_error
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
