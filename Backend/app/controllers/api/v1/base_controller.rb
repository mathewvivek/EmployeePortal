module Api
  module V1
    class BaseController < ApplicationController
      include ActionController::HttpAuthentication::Token::ControllerMethods

      before_action :disable_response_caching
      before_action :authenticate_user!

      rescue_from ActiveRecord::RecordNotFound do
        render json: { errors: [ "Employee not found" ] }, status: :not_found
      end

      rescue_from ActiveRecord::RecordInvalid do |error|
        render json: { errors: error.record.errors.to_hash }, status: :unprocessable_entity
      end

      rescue_from EmployeeDirectory::InvalidParameter do |error|
        render json: { errors: [ error.message ] }, status: :unprocessable_entity
      end

      private

      def disable_response_caching
        response.headers["Cache-Control"] = "no-store"
      end

      def authenticate_user!
        @current_session = authenticate_with_http_token { |token, _options| Session.authenticate(token) }
        unless @current_session
          render json: { errors: [ "Please sign in to continue" ] }, status: :unauthorized
          return
        end
        @current_user = @current_session.user
        unless @current_user.role == "superadmin"
          render json: { errors: [ "HR access is required" ] }, status: :forbidden
        end
      end
    end
  end
end
