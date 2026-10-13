Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  root "api_status#show"

  namespace :api do
    namespace :v1 do
      resource :session, only: [ :create, :show, :destroy ]
      resources :employees, only: [ :index, :show, :create, :update ] do
        get :options, on: :collection
        resource :salary, only: [ :show, :update ]
        resource :salary_history, only: :show, controller: :salary_histories
      end
      resources :compensation_insights, only: :index
      resources :salary_analysis, only: :index
      resources :salary_data_quality_scans, only: :create
      resources :salary_data_anomalies, only: [ :index, :show, :update ]
    end
  end
end
