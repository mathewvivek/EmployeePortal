module Api
  module V1
    class BaseController < ApplicationController
      rescue_from ActiveRecord::RecordNotFound do
        render json: { errors: [ "Employee not found" ] }, status: :not_found
      end

      rescue_from ActiveRecord::RecordInvalid do |error|
        render json: { errors: error.record.errors.to_hash }, status: :unprocessable_entity
      end

      rescue_from EmployeeDirectory::InvalidParameter do |error|
        render json: { errors: [ error.message ] }, status: :unprocessable_entity
      end
    end
  end
end
