# Overview

This is a full-stack marketplace management application called MarketPro built with React (TypeScript) frontend and Express.js backend. The application helps businesses manage their presence across multiple e-commerce platforms like Ozon, Wildberries, and Yandex Market. It provides unified inventory management, order tracking, analytics, and team collaboration features.

## Recent Changes (April 23, 2026)
✓ Migrated database driver from @neondatabase/serverless to standard pg
✓ Added Yandex Cloud SSL certificate support (yandex-ca.pem) in db.ts and drizzle.config.ts
✓ Deployed to Yandex Cloud: VM marketplace-vm (111.88.245.62), Managed PostgreSQL 16
✓ Configured Nginx reverse proxy and systemd auto-restart service

## Recent Changes (January 17, 2025)
✓ Set up complete database schema with PostgreSQL
✓ Implemented user authentication with JWT tokens
✓ Created landing page with pricing and features
✓ Built registration and login modals
✓ Implemented admin demo account for testing
✓ Created dashboard with sidebar navigation
✓ Built settings page with tabs for:
  - Marketplace integrations (Ozon, Wildberries, Yandex Market)
  - Warehouse management
  - Team user management with role-based access
  - Company information management
✓ Added SendGrid email integration for invitations
✓ Fixed all TypeScript compilation errors
✓ Application successfully running on port 5000
✓ Replaced blue background with contextual SVG warehouse/marketplace scene
✓ Added comprehensive pricing animations including:
  - Staggered card entrance animations
  - Hover effects with smooth transforms
  - Animated pricing badges with pulse and glow effects
  - Price counter animations
  - Feature list slide-in animations
  - Popular plan highlighting with gradient borders
✓ Fixed JWT token authentication for API requests
✓ Completely redesigned dashboard to match Flexport-style interface with:
  - Dark slate sidebar with comprehensive navigation
  - Clean white content area with inventory table
  - Professional search and filtering functionality
  - Tabbed interface for Products, Kits, and Bundles
  - Detailed inventory table with multiple data columns
  - Action buttons and dropdown filters
  - Responsive design with hover effects
✓ Simplified navigation to essential tabs only:
  - Fixed sidebar without scrolling (position: fixed)
  - Main navigation: Dashboard (summary cards only), Products (full marketplace management)
  - Bottom section: Settings and Logout
  - Clean layout with proper spacing and correct button order
✓ Created comprehensive Products page with marketplace functionality:
  - Product catalog management with Russian marketplace focus
  - Search, filtering, and sorting capabilities
  - Add/Edit product dialogs with full product information
  - Marketplace-specific product syncing (Ozon, Wildberries, Yandex Market)
  - Stock management with low stock alerts
  - Professional table view with product images, pricing, and status
  - Summary statistics cards for quick overview
✓ Fixed sidebar navigation improvements:
  - Logout button properly aligned with Settings button
  - MarketPro logo is clickable and navigates to dashboard
  - Clean, consistent button styling throughout sidebar
✓ Database cleanup completed:
  - Removed unused tables: inventory, products, orders, order_items, suppliers
  - Database now contains only actively used tables matching schema
  - Clean database structure aligned with application architecture
✓ Added comprehensive products table with marketplace-specific fields:
  - Complete product information including SKU, barcode, dimensions
  - Marketplace integration fields (VAT, HS code, cargo size)
  - Supply chain data (supplier, production days, quantities)
  - Physical properties (weight, dimensions, volume)
  - Status tracking and timestamps
  - Company-scoped data isolation
✓ Implemented bulk product import system:
  - Dropdown menu for "Add Product" with "Add Single Product" and "Import Products" options
  - Separate import dialog with step-by-step process
  - CSV template download with all 23 product fields and example data
  - File upload supporting CSV, XLS, XLSX up to 50,000 rows
  - Backend batch processing in groups of 500 for optimal performance
  - Comprehensive error handling and progress feedback
  - Data validation and type conversion for all numeric fields
✓ Enhanced products table interface:
  - Black header text with center alignment for professional appearance
  - Select all checkbox functionality for bulk operations
  - Replaced dropdown actions with direct Edit and Delete icons
  - Removed focus borders from action buttons for clean interaction
  - Comprehensive edit product dialog with pre-filled data matching add form structure
  - Fixed dialog height and consistent field layout across all tabs
  - Category field changed to text input for flexible user input
✓ Implemented automatic volume and cargo size calculation:
  - Removed manual volume and cargo size input fields from add/edit forms
  - Added server-side calculation logic: volume = length × width × height (cm³ to m³)
  - Implemented cargo size classification: S (≤120×80×50cm & ≤30kg), M (≤60×40×30cm & ≤15kg), L (>120×80×50cm & ≤50kg), XL (>200cm any dimension OR >50kg)
  - Updated CSV import template to exclude volume/cargo size fields
  - Automatic calculation applies to single product creation, editing, and bulk imports
✓ Added value_stream field for hierarchical product categorization:
  - Database schema updated with value_stream column
  - Added to both add/edit product forms with descriptive placeholders
  - Updated CSV import template and bulk import processing
  - Enables two-level categorization: Value Stream (e.g., "Kids") → Category (e.g., "Toys")
  - Fixed validation errors by converting decimal fields to strings before Drizzle processing
✓ Restructured products table layout for improved clarity:
  - Reordered columns: checkbox, image, product, category, brand, dimensions, quantities, supplier, status, actions
  - Product column shows product name with grey SKU below
  - Category column shows value stream on top with grey category below
  - Dimensions column uses consistent font size for all measurements (cm, kg, m³, Size) with increased width (w-40)
  - Removed Sales Period and Production Days columns for streamlined interface
  - Maintained responsive design and hover effects
✓ Enhanced table interactivity with sortable headers:
  - Added clickable sorting functionality for Product, Category, Brand, Supplier, Status columns
  - Implemented A-Z/Z-A toggle sorting with visual indicators (up/down arrows)
  - Removed hover effects from sortable headers for clean interaction
✓ Implemented advanced filtering system:
  - Converted status filter to multiple selection with Popover component
  - Enhanced category filter with multiple selection and value stream grouping
  - Added value stream bulk selection (selecting parent selects all children)
  - Updated active filters display to show both status and category selections
  - Removed green hover effects from filter buttons, added grey-to-black text transition
  - Matched filter button font styling to search bar (size, weight, color)
  - Removed headers from dropdown menus for cleaner appearance
  - Added grey delimiters between value stream sections in category filter
✓ Added product_manager field to products system:
  - Database schema updated with product_manager column after brand_name
  - Added to both add/edit product forms in basic information section
  - Updated CSV import template with product_manager field and sample data
  - Applied database migration to add column to existing products table
✓ Restructured Settings page Account Information section:
  - Separated User Information from Organization Information
  - Account Information tab now shows only User Information (name, email, password, MFA)
  - Created dedicated UserInfoTab component for user-specific settings
  - CompanyTab now focuses purely on organization data without user settings
  - Email address field is now read-only with explanatory message
  - Save button appears only when name is changed, positioned to the right of name field
  - Implemented password change functionality with three-field form (current, new, confirm)
  - Added backend API endpoint for secure password changes with validation
  - Enhanced error handling with specific messages for wrong passwords and validation errors
  - Save button disabled until all fields are filled for better UX
  - Added validation to prevent new password from being the same as current password
✓ Added company selection functionality to Settings Company tab:
  - Users can now view and switch between companies they own or have been invited to
  - API endpoint `/api/companies/user` returns all accessible companies
  - Company switching endpoint `/api/companies/switch` with security validation
  - UI shows company selection dropdown with building icons and active company indicator
  - Seamless switching updates auth context and refreshes all company-scoped data
✓ Implemented company creation functionality:
  - "Create Company" button appears when user has no companies
  - Additional "Create Company" button available when user has existing companies
  - Company creation dialog with subscription plan selection (Starter, Professional, Enterprise)
  - Three subscription tiers with different SKU limits and features
  - Payment process temporarily skipped for testing (ready for Stripe integration)
  - Automatic company owner assignment and user association on creation
  - Real-time UI updates after successful company creation
✓ Simplified registration process:
  - Removed company name field from registration form
  - Users now register without creating a company initially
  - Company creation moved to dedicated Settings page flow
  - Updated backend to support users without companies
  - Fixed dialog accessibility warnings with proper descriptions
✓ Enhanced navigation for users without companies:
  - Sidebar now shows only Settings and Logout when user has no companies
  - Dashboard and Products menu items hidden until user creates a company
  - Logo click redirects to Settings instead of Dashboard for users without companies
  - Added CompanyGuard component to protect Dashboard and Products routes
  - Users without companies are automatically redirected to Settings page
✓ Reordered Settings page tabs:
  - Company tab is now the first tab in Settings
  - Changed default active tab from Account Information to Company
  - Prioritizes company setup for new users without companies
✓ Enhanced company name editing experience:
  - Removed standalone save button from company information form
  - Save button now appears only next to company name field when changed
  - Immediate save functionality for company name changes
  - Cleaner interface with contextual save actions
✓ Simplified company information form:
  - Removed sender email field from company information
  - Form now focuses only on essential company name field
  - Streamlined interface with minimal required information
✓ Added owner email field with role-based access:
  - Owner email field added after company name in company information
  - Only company owners can edit the owner email field
  - Invited users see the field as read-only with explanatory text
  - Contextual save button appears for owners when email is changed
  - Separate save functionality for owner email updates
  - Owner email automatically prefilled from database (owner's user email)
  - Updated storage layer to fetch owner email from user records
✓ Reorganized Settings page structure:
  - Moved warehouses section into integrations tab
  - Renamed "Marketplace Integrations" to "Integrations"
  - Combined marketplace integrations and warehouses in single tab
  - Streamlined navigation with fewer tabs
✓ Redesigned Integrations page layout:
  - Added "Choose an Integration" header with descriptive text
  - Implemented grid layout for Sales Channels (Ozon, Wildberries, Yandex Market)
  - Added Warehouses section with single warehouse card
  - Matched design to reference mockup with clean card layout
  - Added info icons and "Add Integration" buttons for each service
✓ Implemented complete role-based marketplace integration system:
  - Only company owners can add/edit integrations through dedicated dialogs
  - Marketplace-specific integration dialogs with proper field requirements:
    * Ozon: Client-ID + API-Key
    * Wildberries: API-Key only
    * Yandex Market: Business-ID + Campaign-ID + API-Key
  - Added businessId field to database schema for Yandex Market integrations
  - Connection status display for all users (Connected/Disconnected with icons)
  - Horizontal layout with status on left, action buttons on right
  - Complete API integration system with GET/POST/PUT endpoints
  - Fixed accessibility warnings with proper dialog descriptions
  - Fixed card width to 320px (w-80) for consistent layout
  - Removed "+" icons from integration buttons for cleaner interface
✓ Enhanced user invitation system for instant user creation:
  - Modified invitation system to create users directly without email verification
  - Added name field to user invitation form for better user experience
  - Users are instantly added to company and appear in users list immediately
  - System handles both new users (creates account with default password) and existing users (adds to company)
  - Updated button text from "Invite User" to "Add User" to reflect instant creation
  - Toast notifications show generated password for new users
  - Company tab correctly shows only companies where user is owner or invited member
✓ Implemented comprehensive company deletion system:
  - Added "Delete Company" button for company owners with role-based access control
  - Created detailed confirmation dialog with subscription and payment warnings
  - Implemented backend DELETE /api/companies/:id endpoint with ownership verification
  - Added deleteCompany method to storage layer with cascading deletes for related data
  - Comprehensive disclaimer covers subscription cancellation, no payment refunds, and data permanence
  - Only company owners can delete companies, with proper security validation
✓ Fixed critical database operation bugs:
  - Corrected company deletion error by using result.rowCount instead of result.count
  - Updated removeUserFromCompany and updateUserCompanyRole methods for consistent database result checking
  - Fixed database operations that were failing due to incorrect property references
✓ Simplified user management forms:
  - Modified "Add User" form to only require email and role (removed name field)
  - Updated "Edit User" functionality to only allow role changes (removed name editing capability)
  - Backend automatically derives user name from email address for new user creation
  - Streamlined user invitation process with minimal required information
✓ Enhanced Settings page with conditional visibility:
  - Integrations and Users sections now hidden when user has no active companies
  - Only Company and Account Information tabs visible for users without companies
  - Dynamic tab rendering based on user's company membership status
  - Improved user experience by showing only relevant settings options
✓ Implemented comprehensive internationalization system:
  - Added language field to user database schema with default "en"
  - Created bilingual support for English and Russian interface
  - Added language preference selector in Account Information settings
  - Implemented authentication-aware language switching: landing page and registration always in Russian, authenticated app uses user preference
  - Updated all form labels, error messages, and notifications to use translation system
  - Separated user profile updates from company user role management with dedicated API endpoints
  - Fixed backend API to handle language field updates in user profile data
✓ Enhanced warehouse integration management system:
  - Added comprehensive warehouse integration functionality with multiple warehouse support
  - Created warehouses API endpoints (GET, POST, PUT, DELETE) with proper authentication
  - Implemented warehouse integration forms with name, API/Manual toggle, and credentials
  - Added edit and delete functionality for each warehouse with confirmation dialogs
  - Fixed form validation issues and improved user feedback with success/error messages
  - Warehouse cards show connection status, integration type, and edit controls for owners
  - Consistent styling matching sales channel integration cards
✓ Fixed critical security vulnerability in products API endpoints:
  - Added proper company access verification to all products endpoints
  - Products API now returns 403 "Access denied to this company" when user lacks access
  - Implemented same security pattern as integrations and warehouses endpoints
  - Fixed security issue where users could access products after company access removal
  - Updated all endpoints: GET /api/products, POST /api/products, PUT /api/products/:id, DELETE /api/products/:id, POST /api/products/bulk-import, GET /api/products/statistics

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state, React Context for auth
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with standard pg driver (Yandex Managed PostgreSQL)
- **ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: JWT tokens with bcrypt password hashing
- **API**: RESTful endpoints with JSON responses

## Key Components

### Database Schema
- **Users**: Store user accounts with roles (admin, manager, operator, user)
- **Companies**: Multi-tenant architecture supporting company-based isolation
- **Marketplace Integrations**: Store API credentials and settings for each marketplace
- **Warehouses**: Manage multiple warehouse locations per company
- **Invitations**: Handle team member invitation system

### Authentication System
- JWT-based authentication with secure token storage
- Role-based access control (RBAC)
- Company-based data isolation
- Invitation-based team member onboarding

### Marketplace Integrations
- Support for Ozon, Wildberries, and Yandex Market APIs
- Secure credential storage with encryption
- Configurable integration settings per marketplace
- Sync status tracking and error handling

# Data Flow

1. **User Authentication**: Users log in and receive JWT tokens stored in localStorage
2. **Company Context**: All data operations are scoped to the user's company
3. **API Requests**: Frontend makes authenticated requests to Express backend
4. **Database Operations**: Backend uses Drizzle ORM to interact with PostgreSQL
5. **Real-time Updates**: TanStack Query handles caching and refetching

# External Dependencies

## Frontend Dependencies
- **UI Components**: Extensive use of Radix UI primitives for accessibility
- **Icons**: Lucide React for consistent iconography
- **Validation**: Zod for runtime type checking and validation
- **HTTP Client**: Native fetch API with custom wrapper functions

## Backend Dependencies
- **Database**: Yandex Managed PostgreSQL 16 (standard pg driver with SSL)
- **Password Security**: bcrypt for password hashing
- **Email Service**: SendGrid for transactional emails

## Development Tools
- **Type Checking**: TypeScript compiler for static analysis
- **Code Quality**: ESLint and Prettier (implied by structure)
- **Development Server**: Vite dev server with HMR
- **Database Migrations**: Drizzle Kit for schema management

# Deployment Strategy

## Production Build
- **Frontend**: Vite builds optimized static assets to `dist/public`
- **Backend**: esbuild bundles Express server to `dist/index.js`
- **Static Serving**: Express serves built frontend assets in production

## Environment Configuration
- **Development**: Separate dev servers for frontend (Vite) and backend (tsx)
- **Production**: Single Express server serving both API and static files
- **Database**: Uses DATABASE_URL environment variable for connection

## Hosting Considerations
- Deployed on Yandex Cloud Compute (Ubuntu 22.04, 2 vCPU / 4 GB RAM)
- VM public IP: 111.88.245.62, SSH user: yc-user
- Nginx reverse proxy on port 80 → Node.js on port 5000
- systemd service: `marketplacepro.service` (auto-restart enabled)
- Environment variables required: DATABASE_URL, JWT_SECRET
- SSL connection to Yandex Managed PostgreSQL via `yandex-ca.pem`
- Static asset serving handled by Express in production mode

The application follows a modern full-stack TypeScript architecture with emphasis on type safety, developer experience, and scalability. The modular component structure and clear separation of concerns make it maintainable and extensible for future marketplace integrations.