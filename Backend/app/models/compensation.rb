module Compensation
  CURRENCIES = %w[INR USD GBP EUR JPY].freeze

  def self.format_amount(amount)
    decimal = BigDecimal(amount.to_s).round(2, BigDecimal::ROUND_HALF_UP)
    whole, fraction = decimal.to_s("F").split(".")
    "#{whole}.#{fraction.ljust(2, '0')}"
  end
end
