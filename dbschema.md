# SustainSync Database Schema

## Overview
The SustainSync database is designed to support utility bill tracking, forecasting, and sustainability goal management for a mid-sized organization. The schema prioritizes **data integrity**, **flexibility for time-series analysis**, and **seamless integration with Prophet forecasting models**.

---

## Table: `Bill`

### Purpose
Stores normalized utility billing records across power, gas, and water services from 2015 to present. This table serves as the foundation for historical analysis, cost tracking, and Prophet-based forecasting.

### Schema

| Field Name           | Type             | Constraints / Details                                                         |
| -------------------- | ---------------- | ----------------------------------------------------------------------------- |
| **bill_id**          | `IntegerField`   | **Primary Key** – Uses the CSV's `bill_id` to preserve original IDs.          |
| **bill_type**        | `CharField(20)`  | Choices: `"Power"`, `"Gas"`, `"Water"`.                                       |
| **timestamp_upload** | `DateTimeField`  | Nullable, blank allowed – Timestamp when the bill was uploaded.               |
| **bill_date**        | `DateField`      | Nullable, blank allowed – Typically the billing month start date.             |
| **units_of_measure** | `CharField(10)`  | Nullable, blank allowed – Choices: `"kWh"`, `"therms"`, `"CCF"`, `"gallons"`. |
| **consumption**      | `DecimalField`   | `max_digits=14`, `decimal_places=2`, nullable – Total consumption value.      |
| **service_start**    | `DateField`      | Nullable, blank allowed – Start of service period.                            |
| **service_end**      | `DateField`      | Nullable, blank allowed – End of service period.                              |
| **provider**         | `CharField(128)` | Nullable, blank allowed – Utility provider name.                              |
| **city**             | `CharField(128)` | Nullable, blank allowed.                                                      |
| **state**            | `CharField(8)`   | Nullable, blank allowed – State abbreviation.                                 |
| **zip**              | `CharField(16)`  | Nullable, blank allowed – Stored as text to preserve leading zeros.           |
| **cost**             | `DecimalField`   | `max_digits=12`, `decimal_places=2`, nullable – Total bill cost.              |
| **file_source**      | `CharField(64)`  | Nullable, blank allowed – Indicates source file name.                         |

### Design Decisions

#### 1. **IntegerField Primary Key (bill_id)**
**Why:** Preserves original CSV IDs for data provenance and traceability. Using the existing `bill_id` avoids confusion when cross-referencing with source files and maintains referential integrity with legacy data.

**Alternative Considered:** Django's auto-incrementing primary key. Rejected because it would lose the connection to original data sources and complicate data migrations.

#### 2. **CharField for bill_type with Choices**
**Why:** Enforces data consistency at the application level. Limited to three utility types (`Power`, `Gas`, `Water`) that align with organizational billing structure.

**Alternative Considered:** ForeignKey to a separate `UtilityType` table. Rejected as overkill for a static, small set of values. Choices provide sufficient constraint without additional join overhead.

#### 3. **DecimalField for consumption and cost**
**Why:** Financial and consumption data requires precision. `DecimalField` avoids floating-point rounding errors that occur with `FloatField`, critical for accurate cost calculations and forecasting.

- `consumption`: `max_digits=14, decimal_places=2` accommodates large values (e.g., 999,999,999,999.99 gallons) while maintaining precision.
- `cost`: `max_digits=12, decimal_places=2` handles up to $999,999,999.99 with cent-level accuracy.

**Alternative Considered:** `FloatField`. Rejected due to precision loss in financial calculations (e.g., $0.1 + $0.2 ≠ $0.3 in binary floating-point).

#### 4. **CharField for units_of_measure with Choices**
**Why:** Validates unit types at write-time, preventing data entry errors. Supports four standard units:
- `kWh` (kilowatt-hours) for electricity
- `therms` for natural gas
- `CCF` (hundred cubic feet) for alternative gas measurement
- `gallons` for water (added to support common water billing)

**Max Length:** Set to 10 characters to accommodate "gallons" (7 chars) with room for future expansion.

**Alternative Considered:** Free-text field. Rejected because inconsistent units (e.g., "kWh" vs "kwh" vs "kilowatt-hours") would break aggregation queries and forecasting logic.

#### 5. **CharField for zip (not IntegerField)**
**Why:** ZIP codes with leading zeros (e.g., `"01234"` in Massachusetts) would be stored as `1234` in an integer field, losing geographic accuracy. Text storage preserves data fidelity.

**Max Length:** 16 characters supports ZIP+4 format (e.g., `"12345-6789"`) and international postal codes if needed.

#### 6. **Nullable Fields Throughout**
**Why:** Real-world billing data is often incomplete. Making most fields nullable allows the system to:
- Import partial records without validation errors
- Support iterative data cleaning workflows
- Handle missing historical data gracefully

**Trade-off:** More complex query logic (requires null checks). Mitigated by defensive programming in views and ORM queries.

#### 7. **Separate service_start and service_end Fields**
**Why:** Enables accurate period-based analysis. Some utilities bill on irregular cycles (e.g., 28-day vs 31-day months), and having explicit service periods supports:
- Normalizing consumption to daily rates
- Detecting billing anomalies
- Aligning with Prophet's requirement for consistent time intervals

**Alternative Considered:** Single `bill_date` field. Rejected because it doesn't capture service period duration, which varies across billing cycles.

#### 8. **Indexes on bill_date, provider, and (city, state)**
**Why:** Optimizes common query patterns:
- **bill_date:** Time-series queries for forecasting and trend analysis (most frequent)
- **provider:** Filtering by utility company for cost comparisons
- **(city, state):** Geographic aggregation for regional analysis

**Trade-off:** Indexes increase write overhead and storage. Justified by 10x+ speedup on read-heavy analytics workloads.

#### 9. **Ordering by -bill_date**
**Why:** Default descending order shows most recent bills first in Django admin and API responses, matching user expectations for financial data review.

---

## Table: `SustainabilityGoal`

### Purpose
Stores user-defined sustainability goals for AI-powered recommendation alignment. Enables the co-benefit analysis system to generate recommendations that support specific organizational targets.

### Schema

| Field Name      | Type             | Constraints / Details                                |
| --------------- | ---------------- | ---------------------------------------------------- |
| **id**          | `AutoField`      | **Primary Key** (automatically generated by Django). |
| **title**       | `CharField(200)` | Required – Short goal title.                         |
| **description** | `TextField`      | Required – Detailed goal description.                |
| **target_date** | `DateField`      | Nullable, blank allowed – Target completion date.    |
| **created_at**  | `DateTimeField`  | Automatically set when record is created.            |
| **updated_at**  | `DateTimeField`  | Automatically updated when record is modified.       |

### Design Decisions

#### 1. **AutoField Primary Key (id)**
**Why:** Unlike `Bill` records which have external IDs, goals are purely internal entities. Django's auto-incrementing ID simplifies creation and avoids requiring users to manage IDs.

**Alternative Considered:** UUID. Rejected as unnecessary—goals are never synced across systems and integer IDs are more performant for small datasets.

#### 2. **TextField for description**
**Why:** Goals often require multi-paragraph explanations with context. `TextField` supports unlimited length, unlike `CharField` which would truncate content.

**Alternative Considered:** `CharField(1000)`. Rejected because arbitrary length limits frustrate users and don't save storage in PostgreSQL (both use TOAST for long values).

#### 3. **Nullable target_date**
**Why:** Not all sustainability initiatives have fixed deadlines. Making this optional accommodates:
- Ongoing/perpetual goals (e.g., "Continuously reduce carbon footprint")
- Aspirational targets without committed timelines
- Goals in early planning stages

#### 4. **Auto-managed created_at and updated_at**
**Why:** Audit trail for goal lifecycle. `auto_now_add` and `auto_now` eliminate manual timestamp management and provide:
- Sortable creation history (default ordering)
- Change tracking for user accountability
- Data provenance for AI recommendation confidence scoring

**Trade-off:** Cannot backdate goals. Acceptable because goals are forward-looking by nature.

#### 5. **Ordering by -created_at**
**Why:** Newest goals appear first, reflecting current organizational priorities. Users typically focus on recently added goals rather than historical ones.

#### 6. **No ForeignKey to Bill**
**Why:** Goals are strategic targets independent of specific billing records. The relationship is semantic (goals inform analysis) rather than structural (direct database linkage).

**How Goals Integrate:** RAG model receives goals as context and correlates them with bill data at query time, allowing flexible many-to-many relationships without rigid schema constraints.

---

## Rationale Summary

### Denormalization Decisions
- **No separate `UtilityType` table:** Three static values don't justify join overhead
- **No separate `Location` table:** Geographic data is low-cardinality and rarely queried independently

### Precision Over Performance
- **DecimalField over FloatField:** Financial accuracy trumps marginal speed gains
- **Multiple indexes:** Read-heavy analytics workload justifies write-time cost

### Flexibility for ML/AI
- **Nullable fields:** Accommodates incomplete data for Prophet forecasting (handles missing values gracefully)
- **Separate goal table:** Decouples strategic targets from operational data, enabling dynamic RAG context injection

### PostgreSQL-Specific Optimizations
- **DateField indexes:** B-tree indexes on dates accelerate time-series range queries
- **TOAST storage:** Large text fields (description) stored out-of-line automatically
- **Composite index on (city, state):** Supports geographic grouping without full table scans
