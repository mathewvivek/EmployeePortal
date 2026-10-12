class EmployeeSeedData
  COUNT = 10_000
  FIRST_NAMES = %w[
    Alex Jordan Taylor Morgan Casey Avery Riley Cameron Quinn Jamie
    Sam Drew Hayden Parker Robin Reese Skyler Blair Dakota Emery
    Arjun Priya Aisha Noah Emma Liam Mia Ethan Isabella James
    Amelia Benjamin Charlotte Henry Harper Daniel Yuki Grace Olivia Lucas
    Sofia William Abigail Michael Elizabeth Alexander Ella Matthew Scarlett Joseph
    Victoria David Chloe Samuel Lily John Hannah Gabriel Zoey Anthony
    Nora Isaac Layla Andrew Maya Joshua Leah Christopher Hazel Nathan
    Violet Thomas Audrey Caleb Claire Ryan Lucy Adam Stella Adrian
    Elena Julian Naomi Aaron Sarah Leo Alice Eli Ruby Sebastian
    Eva Owen Cora Dylan Iris Luke Nina Oscar Zara Felix
  ].freeze
  LAST_NAMES = %w[
    Morgan Patel Chen Wilson Singh Martin Garcia Khan Bennett Davis
    Clarke Walker Lewis Hall Scott Wright Young Tanaka Allen King
    Williams Anderson Thompson Moore Jackson Harris Robinson Nelson Baker Adams
    Campbell Mitchell Roberts Carter Phillips Evans Turner Torres Parker Collins
    Edwards Stewart Flores Morris Nguyen Murphy Rivera Cook Rogers Reed
    Cooper Richardson Cox Howard Ward Peterson Gray Ramirez James Watson
    Brooks Kelly Sanders Price Wood Barnes Ross Henderson Coleman Jenkins
    Perry Powell Long Patterson Hughes Foster Butler Simmons Bryant Russell
    Griffin Hayes Myers Ford Hamilton Graham Sullivan Wallace Woods Cole
    Mehta Sharma Kapoor Iyer Reddy Desai Nakamura Suzuki Sato Kim
  ].freeze
  LOCATIONS = [ [ "United States", "USD", 72000 ], [ "India", "INR", 1200000 ],
    [ "United Kingdom", "GBP", 58000 ], [ "Germany", "EUR", 64000 ], [ "Japan", "JPY", 6000000 ] ].freeze
  DEPARTMENTS = [ [ "Engineering", "Software Engineer" ], [ "Design", "Product Designer" ],
    [ "People", "People Partner" ], [ "Finance", "Financial Analyst" ],
    [ "Product", "Product Manager" ], [ "Sales", "Account Executive" ] ].freeze

  def self.rows(count: COUNT)
    raise ArgumentError, "Seed count must be a positive integer" unless count.is_a?(Integer) && count.positive?
    if count > FIRST_NAMES.length * LAST_NAMES.length
      raise ArgumentError, "Seed count exceeds the number of unique full names"
    end
    return enum_for(:rows, count: count) unless block_given?

    # Shuffle combinations without replacement, keeping names stable across seed reruns.
    names = FIRST_NAMES.product(LAST_NAMES).shuffle(random: Random.new(20261012))
    count.times do |index|
      country, currency, base = LOCATIONS[index % LOCATIONS.length]
      department, designation = DEPARTMENTS[index % DEPARTMENTS.length]
      yield({
        employee_id: format("SEED%05d", index + 1),
        name: names[index].join(" "),
        department: department, country: country, designation: designation,
        status: index % 7 == 0 ? "inactive" : "active",
        base_salary: format("%d.%02d", base + (index % 250) * 1000, index % 100),
        currency: currency, effective_date: Date.new(2026, 10, 1)
      })
    end
  end

  def self.load!(count: COUNT, batch_size: 1000, refresh_names: false)
    production_enabled = Rails.env.production? && ENV["ALLOW_PRODUCTION_SEEDS"] == "true"
    unless Rails.env.development? || Rails.env.test? || production_enabled
      raise ArgumentError, "Synthetic employees can only be seeded in development or test unless ALLOW_PRODUCTION_SEEDS=true in production"
    end
    unless batch_size.is_a?(Integer) && batch_size.positive?
      raise ArgumentError, "Batch size must be a positive integer"
    end

    processed = 0
    Employee.transaction do
      rows(count: count).each_slice(batch_size) do |batch|
        options = { unique_by: :index_employees_on_employee_id, returning: %w[id] }
        result = if refresh_names
          Employee.upsert_all(batch, **options, update_only: [ :name ])
        else
          Employee.insert_all(batch, **options)
        end
        processed += result.rows.length
      end
    end
    processed
  end
end
