from django.db import models


# Model representing a utility bill (electricity, gas, water)
class Bill(models.Model):
	BILL_TYPE_POWER = "Power"
	BILL_TYPE_GAS = "Gas"
	BILL_TYPE_WATER = "Water"

	BILL_TYPE_CHOICES = [
		(BILL_TYPE_POWER, "Power"),
		(BILL_TYPE_GAS, "Gas"),
		(BILL_TYPE_WATER, "Water"),
	]

	# Using the CSV's bill_id as the primary key to preserve original ids
	bill_id = models.IntegerField(primary_key=True)
	bill_type = models.CharField(max_length=20, choices=BILL_TYPE_CHOICES)

	# timestamp when the row was uploaded/recorded
	timestamp_upload = models.DateTimeField(null=True, blank=True)

	# invoice/bill date (typically the month start in the CSV)
	bill_date = models.DateField(null=True, blank=True)

	# Units of measure limited to values present in the CSV
	UNITS_KWH = "kWh"
	UNITS_THERMS = "therms"
	UNITS_CCF = "CCF"

	UNITS_OF_MEASURE_CHOICES = [
		(UNITS_KWH, "kWh"),
		(UNITS_THERMS, "therms"),
		(UNITS_CCF, "CCF"),
	]

	units_of_measure = models.CharField(
		max_length=8, choices=UNITS_OF_MEASURE_CHOICES, null=True, blank=True
	)

	# consumption values: use decimal for precision (eg kWh, therms, CCF)
	consumption = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

	service_start = models.DateField(null=True, blank=True)
	service_end = models.DateField(null=True, blank=True)

	provider = models.CharField(max_length=128, null=True, blank=True)
	city = models.CharField(max_length=128, null=True, blank=True)
	state = models.CharField(max_length=8, null=True, blank=True)

	# store zip as text to preserve leading zeros where applicable
	zip = models.CharField(max_length=16, null=True, blank=True)

	# cost is monetary: decimal with 2 decimal places
	cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

	file_source = models.CharField(max_length=64, null=True, blank=True)

	class Meta:
		verbose_name = "Bill"
		verbose_name_plural = "Bills"
		ordering = ["-bill_date"]
		indexes = [
			models.Index(fields=["bill_date"]),
			models.Index(fields=["provider"]),
			models.Index(fields=["city", "state"]),
		]

	def __str__(self):
		return f"{self.bill_type} bill {self.bill_id} ({self.bill_date})"


class SustainabilityGoal(models.Model):
	"""Model representing custom sustainability goals set by the user."""
	
	title = models.CharField(max_length=200)
	description = models.TextField()
	target_date = models.DateField(null=True, blank=True, help_text="Target completion date")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)
	
	class Meta:
		verbose_name = "Sustainability Goal"
		verbose_name_plural = "Sustainability Goals"
		ordering = ['-created_at']
	
	def __str__(self):
		return self.title
