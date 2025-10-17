# Dentalcare Clinic System

A simple, web-based clinic management system for a dental clinic, built with Node.js, Express, and EJS.

## Core Technologies

*   **Backend:** Node.js, Express.js
*   **Frontend:** EJS (Embedded JavaScript templates)
*   **Database:** SQLite
*   **Authentication:** Passport.js with local strategy (sessions)
*   **Styling:** Basic CSS

## Getting Started

### Prerequisites

*   Node.js (v14 or later recommended)
*   npm

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <project-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up the database:**
    This command creates the `Dentalcare.db` file and populates it with initial tables and mock data.
    ```bash
    node setup-database.js
    ```

4.  **Run the application:**
    ```bash
    npm start
    ```

5.  **Access the application:**
    Open your web browser and navigate to `http://localhost:3000`.

## Mock Users for Testing

You can use these accounts to log in and test different roles:

*   **Dentist Account:**
    *   **Citizen ID:** `1111111111111`
    *   **Password:** `password123`

*   **Staff Account:**
    *   **Citizen ID:** `2222222222222`
    *   **Password:** `password123`
