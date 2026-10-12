if Rails.env.development? && ENV["SEED_DEMO_EMPLOYEES"] == "true"
  names = [
    "Dianne Russell", "Jane Cooper", "Kristin Watson", "Marvin McKinney",
    "Eleanor Pena", "Priya Sharma", "Charles Zhao", "Devon Lane",
    "Alice Morgan", "Bob Chen", "Carla Jones", "David Singh",
    "Arjun Mehta", "Olivia Bennett", "Lucas Martin", "Sofia Garcia",
    "Aisha Khan", "Noah Williams", "Emma Wilson", "Liam Anderson",
    "Mia Thompson", "Ethan Davis", "Isabella Clark", "James Lewis",
    "Amelia Walker", "Benjamin Hall", "Charlotte Young", "Henry Allen",
    "Harper King", "Daniel Wright", "Yuki Tanaka", "Grace Scott"
  ]
  locations = [ [ "United States", "USD" ], [ "India", "INR" ], [ "United Kingdom", "GBP" ],
    [ "Germany", "EUR" ], [ "Japan", "JPY" ] ]
  departments = {
    "Engineering" => "Software Engineer", "Design" => "Product Designer", "People" => "People Partner",
    "Finance" => "Financial Analyst", "Product" => "Product Manager", "Sales" => "Account Executive"
  }
  salaries = { "USD" => 72000, "INR" => 1200000, "GBP" => 58000, "EUR" => 64000, "JPY" => 6000000 }

  names.each_with_index do |name, index|
    country, currency = locations[index % locations.length]
    department, designation = departments.to_a[index % departments.length]
    Employee.find_or_create_by!(employee_id: "EMP#{2001 + index}") do |employee|
      employee.assign_attributes(
        name: name, country: country, currency: currency, department: department,
        designation: designation, status: index % 7 == 6 ? "inactive" : "active",
        base_salary: salaries.fetch(currency) + (index % 8) * 2500,
        effective_date: Date.new(2026, 10, 1)
      )
    end
  end
end
