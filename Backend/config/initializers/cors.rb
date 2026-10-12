Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "https://employee-portal-frontend-1hdp.onrender.com"

    resource "/api/*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options ]
  end
end
