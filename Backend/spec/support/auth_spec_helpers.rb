module AuthSpecHelpers
  def create_user(**attributes)
    User.create!({ email: "test.hr@example.com", name: "Test HR", role: "superadmin",
      password: "TestingHR!2026Access" }.merge(attributes))
  end

  def session_headers(user: create_user)
    _session, token = Session.issue!(user: user)
    { "Authorization" => "Bearer #{token}" }
  end
end

module AuthenticatedRequests
  %i[get post patch put delete head].each do |method|
    define_method(method) do |path, **options|
      unless @authenticated_session&.expires_at&.future?
        @authenticated_user ||= create_user
        @authenticated_session, token = Session.issue!(user: @authenticated_user)
        @authenticated_headers = { "Authorization" => "Bearer #{token}" }
      end
      headers = @authenticated_headers.merge(options.fetch(:headers, {}))
      super(path, **options.merge(headers: headers))
    end
  end
end
