# Navbar System Documentation

## Overview
All authenticated pages (builder, profile, pricing) now use a consistent, shared navbar system to avoid code duplication and ensure UI consistency.

## Files Structure

### Shared Components
- `navbar-template.html` - Reference template for navbar HTML
- `navbar.css` - Shared CSS styles for all navbars

### Page Implementation
Each authenticated page includes:
1. `navbar.css` (shared styles)
2. Page-specific CSS (builder.css, profile.css, pricing.css)
3. Consistent navbar HTML structure

## Navbar HTML Structure
```html
<nav class="navbar">
  <div class="nav-container">
    <div class="brand">ResumeAI<span class="dot">.</span></div>
    <div class="nav-links">
      <a href="/profile" class="nav-link">My Profile</a>
      <a href="/builder" class="nav-link">Builder</a>
      <a href="/pricing" class="nav-link">Pricing</a>
      <a href="/" class="nav-link logout">Sign Out</a>
    </div>
  </div>
</nav>
```

## CSS Includes
```html
<head>
  <link rel="stylesheet" href="/static/css/navbar.css">
  <link rel="stylesheet" href="/static/css/page-specific.css">
</head>
```

## Adding New Authenticated Pages
1. Include `navbar.css` in the HTML head
2. Use the standard navbar HTML structure
3. Add any page-specific navigation links if needed
4. Ensure consistent branding and styling

## Benefits
- ✅ Consistent UI across all pages
- ✅ Easy maintenance - change navbar once, applies everywhere
- ✅ Reduced code duplication
- ✅ Professional, unified user experience