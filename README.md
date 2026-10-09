# Bottle Project ERP

A comprehensive full-stack Enterprise Resource Planning (ERP) application designed for manufacturing, production tracking, and inventory management in the glass/bottle industry.

## Tech Stack

### Frontend (Admin Panel)
- **Framework:** React.js (Vite)
- **State Management:** Redux Toolkit
- **Routing:** React Router v6
- **UI/UX:** Custom CSS, Bootstrap Icons (`bi-icons`), SweetAlert2 for interactive notifications
- **Data Visualization:** Recharts for analytical dashboards and production summaries

### Backend (REST API)
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens) & HTTP-only cookies
- **File Uploads:** Express static uploads directory

---

## System Modules & Features

The ERP is broken down into several interconnected modules that handle the full lifecycle of production—from raw material ingestion to final coated/printed products.

### 1. Security & Access Control
- **Authentication (`/api/auth`):** Secure login with JWT.
- **User Management (`/api/users`):** Admin portal to add and manage system users.
- **Roles & Permissions (`/api/roles`, `/api/permissions`):** Granular access control defining exactly what resources users can view, create, edit, or delete (e.g., locking historical records).

### 2. Organization Hierarchy
- **Companies (`/api/company`):** Top-level organizational entities.
- **Brands (`/api/brand`):** Brands associated with specific companies, allowing filtering and drill-down across the system.

### 3. Catalog & Specifications (Master Data)
- **Bottle Specs (`/api/bottle-spec`):** Defines the structural specifications of various bottles.
- **Variants (`/api/variant`):** Product variations (size, shape, image mappings).
- **Formulas (`/api/formula`):** Defines the chemical or material recipes used for coating/printing.
- **Raw Materials (`/api/raw-material`):** Inventory items consumed during production.
- **Units (`/api/unit`):** Dynamic master list of production units/machines (e.g., "Unit 1", "Unit 2").

### 4. Production Management
- **Printing Production (`/api/production`):** Tracks daily printing metrics, including operator details, shifts, actual quantities, and rejection rates.
- **Coating Production (`/api/coating-production`):** Tracks daily coating metrics with dynamic unit assignment, bottle-per-box calculations, and shade specifications.
- **Production Masters:**
  - **Operators (`/api/operator`):** Master list of machine operators.
  - **Shifts (`/api/shift`):** Master list of production shifts (e.g., A, B, C).

### 5. Configurable Types & Attributes
- **Printing Types (`/api/printing-type`) & Printing Colors (`/api/printing-color`)**
- **Coating Types (`/api/coating-type`) & Text Colors (`/api/text-color`)**

### 6. Inventory & Stock Management
- **Stock Entries (`/api/stock-entry`):** Logs incoming/outgoing raw materials.
- **Stock Summary & History:** Real-time dashboard of stock IN/OUT mapped by unit (e.g., KGs, Liters).

### 7. AI & Labeling Integration
- **SG Labels (`/api/sg-label`, `/api/sg-label-2`):** Custom and auto-synced label management.
- **Vision AI (`/api/vision`, `/api/invoice-vision`):** AI integration (likely OCR-based) for processing invoices or automating quality control via computer vision.

---

## Application Structure

### `/admin panel` (Frontend)
Contains the React application.
- `src/pages/`: Organized by module (e.g., `CoatingProduction`, `StockEntry`, `system`).
- `src/redux/`: Global state management with Redux slices for every module.
- `src/components/`: Reusable UI components like `Sidebar`, `Topbar`, and `SearchableSelect`.

### `/Backend` (Backend)
Contains the Express server.
- `src/app.js`: Main entry point configuring Express, CORS, and registering all routes.
- `src/routes/`: Express routers mapping HTTP methods to controllers.
- `src/controllers/`: Business logic for handling requests, performing database operations, and returning JSON.
- `src/models/`: Mongoose schemas defining the structure of MongoDB collections.
- `src/middleware/`: Middleware for JWT validation (`auth`) and role-based access checks (`checkAbility`).

---

## Running the Application Locally

### 1. Start the Backend
1. Open a terminal and navigate to the `Backend/` directory.
2. Run `npm install` to ensure dependencies are installed.
3. Start the server using Nodemon:
   ```bash
   npx nodemon server.js
   ```
4. The server will run on `http://localhost:5000`.

### 2. Start the Frontend
1. Open a new terminal and navigate to the `admin panel/` directory.
2. Run `npm install` to ensure dependencies are installed.
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the ERP at `http://localhost:5173`.
