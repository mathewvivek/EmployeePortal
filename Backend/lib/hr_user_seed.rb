class HrUserSeed
  DEVELOPMENT_EMAIL = "hr@employeeportal.test"
  DEVELOPMENT_PASSWORD = "HrDemo!2026Access"

  def self.load!
    unless Rails.env.development? || Rails.env.test? || (Rails.env.production? && ENV["SEED_HR_USER"] == "true")
      raise ArgumentError, "Set SEED_HR_USER=true to provision the production HR account"
    end

    email = ENV.fetch("HR_LOGIN_EMAIL", DEVELOPMENT_EMAIL).strip.downcase
    password = ENV["HR_LOGIN_PASSWORD"]
    password ||= DEVELOPMENT_PASSWORD if Rails.env.development? || Rails.env.test?
    raise ArgumentError, "Set HR_LOGIN_PASSWORD to a strong production password" if password.blank?

    user = User.find_or_create_by!(email: email) do |user|
      user.name = "HR Administrator"
      user.role = "superadmin"
      user.password = password
    end
    if ENV["ROTATE_HR_PASSWORD"] == "true" && !user.authenticate(password)
      user.update!(password: password)
    end
    user
  end
end
