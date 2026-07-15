#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " Network Topology Manager"
echo "============================================"
echo

# --- 1. PHP ---
if ! command -v php &> /dev/null; then
    echo "PHP not found. Installing..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y php php-pdo-sqlite php-sqlite3 php-cli
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y php php-pdo php-sqlite3 php-cli
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm php php-sqlite
    elif command -v brew &> /dev/null; then
        brew install php
    else
        echo "ERROR: Cannot auto-install PHP. Install PHP 8.x manually."
        echo "  Ubuntu/Debian: sudo apt install php php-pdo-sqlite php-sqlite3 php-cli"
        echo "  Fedora:        sudo dnf install php php-pdo php-sqlite3 php-cli"
        echo "  Arch:          sudo pacman -S php php-sqlite"
        echo "  macOS:         brew install php"
        echo "  Download:      https://www.php.net/downloads"
        exit 1
    fi
fi

PHP_VER=$(php -r "echo PHP_VERSION;" 2>/dev/null)
echo "PHP version: $PHP_VER"

# --- 2. PDO SQLite driver ---
if ! php -m 2>/dev/null | grep -q pdo_sqlite; then
    echo "pdo_sqlite extension not found. Installing..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y php-pdo-sqlite php-sqlite3
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y php-pdo php-sqlite3
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm php-sqlite
    elif command -v brew &> /dev/null; then
        echo "Homebrew PHP should include pdo_sqlite. Try: brew reinstall php"
    else
        echo "ERROR: Cannot auto-install pdo_sqlite. Install it manually:"
        echo "  Ubuntu/Debian: sudo apt install php-pdo-sqlite php-sqlite3"
        echo "  Fedora:        sudo dnf install php-pdo php-sqlite3"
        echo "  Arch:          sudo pacman -S php-sqlite"
        echo ""
        echo "  Or enable in php.ini:"
        echo "    extension=pdo_sqlite"
        echo "    extension=sqlite3"
        exit 1
    fi
fi

echo "pdo_sqlite: OK"
echo

# --- 3. Create DB directory if needed ---
mkdir -p db

# --- 4. Start server ---
PORT="${1:-8000}"

echo "Starting server at http://localhost:${PORT}"
echo
echo "Pages:"
echo "  http://localhost:${PORT}/models.html"
echo "  http://localhost:${PORT}/nodes.html"
echo "  http://localhost:${PORT}/connections.html"
echo "  http://localhost:${PORT}/topology.html"
echo "  http://localhost:${PORT}/settings.html"
echo
echo "Press Ctrl+C to stop."
echo

php -S "localhost:${PORT}" api/index.php
