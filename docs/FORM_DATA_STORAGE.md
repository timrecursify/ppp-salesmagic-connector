# Form Data Storage Architecture

## Overview

Form data is stored as **JSON** in the `form_data` column of the `tracking_events` table.

## Database Schema

```sql
-- Form data column (added in migration 0002)
ALTER TABLE tracking_events ADD COLUMN form_data TEXT DEFAULT NULL;

-- Index for form data queries
CREATE INDEX idx_tracking_events_form_data ON tracking_events(form_data) 
WHERE form_data IS NOT NULL;
```

**Column Type:** `TEXT` (stores JSON string)  
**Nullable:** Yes (NULL for pageview events, JSON string for form submissions)

## Storage Format

Form data is stored as a **JSON string** in the database:

```json
{
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1-555-123-4567",
  "project_date": "2025-06-15",
  "select_service": "Wedding",
  "budget": "$6,000 - $10,000",
  "total_guests": "50+",
  "event_type": "Wedding",
  "services": "Design, Decorations, Florals",
  "custom_field": "custom_value",
  "another_field": "another_value"
}
```

## Automatic Field Capture

The pixel.js (v2.4.0) **automatically captures ALL form fields** without any configuration:

### Captured Field Types

1. **Text Inputs** (`<input type="text">`)
   - All text values captured
   - Trimmed of whitespace

2. **Email Fields** (`<input type="email">`)
   - Email addresses captured
   - Normalized to `email` key

3. **Textareas** (`<textarea>`)
   - All text content captured
   - Multi-line text preserved

4. **Select Dropdowns** (`<select>`)
   - Selected value captured
   - Option text captured

5. **Checkboxes** (`<input type="checkbox">`)
   - Checked state: `"true"` or `"false"`
   - Unchecked boxes skipped (unless explicitly needed)

6. **Radio Buttons** (`<input type="radio">`)
   - Selected value captured
   - Grouped by `name` attribute

7. **Date Fields** (`<input type="date">`)
   - Date values in ISO format
   - Example: `"2025-06-15"`

8. **Number Fields** (`<input type="number">`)
   - Numeric values captured
   - Stored as string

9. **Tel Fields** (`<input type="tel">`)
   - Phone numbers captured
   - Format preserved

10. **File Uploads** (`<input type="file">`)
    - File names captured
    - File metadata (size, type) if available
    - **File contents NOT captured** (privacy/security)

### Field Name Normalization

The pixel automatically normalizes field names:

- **Hyphens → Underscores:** `first-name` → `first_name`
- **Case Normalization:** `Email` → `email`
- **Component IDs:** `input_comp-kfmqou8s` → `input_comp_kfmqou8s`
- **Common Variations:**
  - `first-name`, `firstName`, `FirstName` → `first_name`
  - `last-name`, `lastName`, `LastName` → `last_name`
  - `email`, `Email`, `EMAIL`, `e-mail` → `email`

### Excluded Fields

The pixel **skips** these fields for security/privacy:

- Password fields (`type="password"`)
- Submit buttons (`type="submit"`)
- Regular buttons (`type="button"`)
- Hidden fields (`type="hidden"`)
- Fields without `name` or `id` attributes
- Empty fields (except checkboxes)

## Data Flow

```
1. User fills out form on website
   ↓
2. Form submit event triggered
   ↓
3. pixel.js captures ALL form fields
   ↓
4. Form data normalized and stored in localStorage/sessionStorage
   ↓
5. User navigates to thank-you page
   ↓
6. pixel.js retrieves stored form data
   ↓
7. Form data sent to /api/track endpoint as JSON object
   ↓
8. Server sanitizes form data (XSS protection)
   ↓
9. Form data stored as JSON string in form_data column
   ↓
10. Database stores complete form data
```

## Querying Form Data

### Get Form Data from Database

```sql
-- Get form submissions with form data
SELECT 
    id,
    event_type,
    page_url,
    form_data,
    created_at
FROM tracking_events
WHERE form_data IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Parse Form Data JSON

```sql
-- Extract specific field from form_data JSON
SELECT 
    id,
    json_extract(form_data, '$.email') as email,
    json_extract(form_data, '$.first_name') as first_name,
    json_extract(form_data, '$.budget') as budget
FROM tracking_events
WHERE form_data IS NOT NULL;
```

### Search Form Data

```sql
-- Find form submissions with specific field value
SELECT 
    id,
    page_url,
    form_data,
    created_at
FROM tracking_events
WHERE form_data LIKE '%"email":"user@example.com"%'
ORDER BY created_at DESC;
```

## Advantages of JSON Storage

### ✅ Flexibility
- No schema changes needed for new fields
- Captures any form structure automatically
- Handles dynamic forms (fields added/removed)

### ✅ Completeness
- All form fields captured automatically
- No configuration needed per form
- Works with any form structure

### ✅ Queryability
- SQLite JSON functions for querying
- Can extract specific fields
- Can search within JSON

### ✅ Performance
- Single column storage
- Indexed for NULL checks
- Efficient for form submission queries

## Example Form Data

### Cloud Nine Form Submission

```json
{
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "phone": "+1-954-787-0127",
  "project_date": "2025-08-15",
  "select_service": "Wedding",
  "budget": "$6,000 - $10,000",
  "total_guests": "50+",
  "additional_notes": "Outdoor ceremony preferred"
}
```

### Miami Flowers Form Submission

```json
{
  "email": "couple@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "631-507-6364",
  "event_type": "Wedding",
  "services": "Design, Decorations, Florals, Lightning",
  "budget": "$10,000+",
  "event_date": "2025-09-20",
  "venue": "Beachfront location",
  "color_scheme": "Blush and gold"
}
```

## Security & Privacy

### XSS Protection
- All form data sanitized server-side
- HTML entities encoded
- Dangerous patterns filtered
- Script tags removed

### Privacy
- Password fields never captured
- File contents never captured
- Sensitive data can be filtered
- GDPR compliant storage

### Validation
- Email format validation
- Field length limits (500 chars)
- JSON structure validation
- Malformed data rejected

## Migration Notes

- Form data column added in migration `0002_add_form_data_capture.sql`
- Existing events have `form_data = NULL`
- Only form submission events have form data
- Pageview events have `form_data = NULL`

## Best Practices

1. **Always query with NULL check:**
   ```sql
   WHERE form_data IS NOT NULL
   ```

2. **Use JSON functions for extraction:**
   ```sql
   json_extract(form_data, '$.field_name')
   ```

3. **Handle missing fields gracefully:**
   ```sql
   COALESCE(json_extract(form_data, '$.email'), 'N/A')
   ```

4. **Index on form_data for performance:**
   ```sql
   CREATE INDEX idx_form_data ON tracking_events(form_data) 
   WHERE form_data IS NOT NULL;
   ```

---

**Last Updated:** January 27, 2025  
**Pixel Version:** v2.4.0  
**Storage Format:** JSON string in TEXT column

