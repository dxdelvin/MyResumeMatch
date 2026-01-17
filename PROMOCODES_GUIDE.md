# 🎉 Promocode System - Quick Guide

## Create a Promocode

```bash
python manage_promocodes.py --create SUMMER2024 --credits 10 --max-uses 500 --expires 2025-08-31
```

## Options

```bash
--create CODE           # Required: promocode name (e.g., SUMMER2024)
--credits 10            # Optional: credits to award (default: 10)
--max-uses 100          # Optional: max redemptions (omit for unlimited)
--expires 2025-12-31    # Optional: expiration date (omit for never expires)
```

## Examples

### Basic (10 credits, unlimited uses, never expires)
```bash
python manage_promocodes.py --create LAUNCH
```

### With limits (10 credits, 500 max uses, expires Aug 31)
```bash
python manage_promocodes.py --create SUMMER2024 --credits 10 --max-uses 500 --expires 2025-08-31
```

### Generous bonus (20 credits, 100 uses, expires Jan 31)
```bash
python manage_promocodes.py --create NEWYEAR2025 --credits 20 --max-uses 100 --expires 2025-01-31
```

## View Codes

```bash
# List all codes
python manage_promocodes.py --list

# See stats for one code
python manage_promocodes.py --stats SUMMER2024
```

## Manage Codes

```bash
# Turn off a code
python manage_promocodes.py --deactivate SUMMER2024

# Turn it back on
python manage_promocodes.py --activate SUMMER2024

# Delete a code
python manage_promocodes.py --delete SUMMER2024
```

## How Users Use It

During profile creation, users see:
```
Promocode (Optional) 🎉
Enter Code: [SUMMER2024] [Apply Code]
✅ Promocode 'SUMMER2024' applied! +10 credits awarded.
```

Users get 5 base credits + bonus credits from the code.

## That's It!

Your promocode system is ready to go. Users can now enter codes during signup to get bonus credits.
