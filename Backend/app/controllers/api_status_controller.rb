class ApiStatusController < ActionController::Base
  PRODUCTION_FRONTEND_URL = "https://employee-portal-frontend-1hdp.onrender.com".freeze
  DEVELOPMENT_FRONTEND_URL = "http://127.0.0.1:5173".freeze
  def show
    @checked_at = Time.current.utc
    @frontend_url = frontend_url
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    respond_to do |format|
      format.html { render :show, layout: false }
      format.json { render json: { status: "up", timestamp: @checked_at.iso8601 } }
    end
  end

  private

  def frontend_url
    default = Rails.env.production? ? PRODUCTION_FRONTEND_URL : DEVELOPMENT_FRONTEND_URL
    configured = ENV["FRONTEND_URL"].presence&.strip || default
    uri = URI.parse(configured)
    allowed_scheme = uri.scheme == "https" || (!Rails.env.production? && uri.scheme == "http")
    if allowed_scheme && uri.host.present? && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil? && [ "", "/" ].include?(uri.path)
      configured
    else
      default
    end
  rescue URI::InvalidURIError
    default
  end
end
