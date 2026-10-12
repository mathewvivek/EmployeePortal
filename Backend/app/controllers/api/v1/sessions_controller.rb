module Api
  module V1
    class SessionsController < BaseController
      LOGIN_RATE_LIMIT_STORE = ActiveSupport::Cache::MemoryStore.new

      skip_before_action :authenticate_user!, only: :create
      rate_limit to: 10, within: 3.minutes, only: :create, store: LOGIN_RATE_LIMIT_STORE,
        with: -> { render json: { errors: [ "Too many sign-in attempts. Try again in three minutes." ] }, status: :too_many_requests }

      def create
        credentials = params.expect(session: [ :email, :password ])
        password = credentials[:password].to_s
        user = if password.bytesize <= 72
          User.where(active: true).authenticate_by(email: credentials[:email].to_s.strip.downcase, password: password)
        end
        unless user
          render json: { errors: [ "Email or password is incorrect" ] }, status: :unauthorized
          return
        end
        session, token = Session.issue!(user: user)
        render json: { data: { user: user.public_attributes, token: token, expires_at: session.expires_at.iso8601 } }, status: :created
      rescue ActionController::ParameterMissing
        render json: { errors: [ "Email and password are required" ] }, status: :bad_request
      end

      def show
        render json: { data: { user: @current_user.public_attributes, expires_at: @current_session.expires_at.iso8601 } }
      end

      def destroy
        @current_session.destroy!
        head :no_content
      end
    end
  end
end
