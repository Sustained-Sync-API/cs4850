from django.db import models
from django.core.validators import MinValueValidator, RegexValidator
from django.core.exceptions import ValidationError
import uuid


class Bill(models.Model):
    class BillType(models.TextChoices):
        POWER = 'Power', 'Power'
        GAS = 'Gas', 'Gas'
        WATER = 'Water', 'Water'

    BILL_ID = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    BILL_TYPE = models.CharField(max_length=10, choices=BillType.choices)
    TIMESTAMP_UPLOAD = models.DateTimeField(auto_now_add=True)
    BILL_DATE = models.DateField()
    UNITS_OF_MEASURE = models.CharField(max_length=32)
    CONSUMPTION = models.FloatField(validators=[MinValueValidator(0)])
    SERVICE_START = models.DateField(null=True, blank=True)
    SERVICE_END = models.DateField()
    PROVIDER = models.CharField(max_length=128)
    CITY = models.CharField(max_length=128)
    STATE = models.CharField(max_length=2)
    ZIP = models.CharField(max_length=5, validators=[RegexValidator(regex=r'^\d{5}$', message='ZIP must be 5 digits')])
    COST = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    FILE_SOURCE = models.TextField()

    def clean(self):
        # Ensure SERVICE_END >= SERVICE_START if both are set
        if self.SERVICE_START and self.SERVICE_END:
            if self.SERVICE_END < self.SERVICE_START:
                raise ValidationError({'SERVICE_END': 'SERVICE_END must be greater than or equal to SERVICE_START.'})

    def __str__(self):
        return f"Bill {self.BILL_ID} ({self.BILL_TYPE})"
