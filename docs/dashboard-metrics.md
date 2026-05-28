# Dashboard Metrics Upload

The dashboard supports a single multi-sheet Excel upload for the main metric sections.

## File Type

Choose **Dashboard Metrics** in the upload panel.

## Expected Sheets

- `Load Curve (Kw)`
- `Sales (Kwh)`
- `System Loss (Kwh)`
- `System Loss (%)`
- `(Interruption) SAIDI`
- `(Interruption) SAIFI`
- `(Interruption) MAIFI`

Each sheet must have a `Year/Month` column and monthly columns from `January` to `December`.

## Dashboard Sections

The latest Dashboard Metrics upload is used first for:

- Load Curve
- Sales
- System Loss
- Power Interruption

If no Dashboard Metrics upload is available, the existing EDD/hourly upload endpoints continue to provide data where supported.

## Notes

- Do not commit real upload workbooks. `Dashboard (Format).xlsx` is ignored.
- Real uploaded data is stored under `uploads/`, which is also ignored.
- Environment credentials stay in `.env`, which is ignored.
