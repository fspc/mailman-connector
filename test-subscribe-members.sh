#!/bin/bash
# Production batch subscription script for LWVWV members
# Usage: ./subscribe-members.sh <csv_file> <password> [list_id] [connector_url]
#
# This script reads a CSV file (email,first_name,last_name) and subscribes
# all members to the specified Mailman list via the connector API.
#
# Arguments:
#   csv_file        Path to CSV file with format: email,first_name,last_name
#   password        Secret password for the mailman-connector (required)
#   list_id         Target mailing list (default: members.lists.example.org)
#   connector_url   URL of the mailman-connector (default: https://mailman-connector.example.com)
#
# Example:
#   ./subscribe-members.sh members.csv mysecretpassword
#   ./subscribe-members.sh members.csv mysecretpassword test.lists.example.org
#   ./subscribe-members.sh members.csv mysecretpassword test.lists.example.org https://connector.example.com

# Show help
show_help() {
    cat << EOF
Usage: $0 <csv_file> <password> [list_id] [connector_url]

Arguments:
  csv_file        Path to CSV file with format: email,first_name,last_name
  password        Secret password for the mailman-connector (required)
  list_id         Target mailing list (default: members.lists.example.org)
  connector_url   URL of the mailman-connector (default: https://mailman-connector.example.com)

Examples:
  $0 members.csv mysecretpassword
  $0 members.csv mysecretpassword test.lists.example.org
  $0 members.csv mysecretpassword test.lists.example.org https://connector.example.com

CSV Format:
  The CSV file should have one member per line:
  email@example.com,FirstName,LastName
  another@example.com,John,Doe

EOF
}

# Check for help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Parse arguments
CSV_FILE="${1:-}"
CONNECTOR_PASSWORD="${2:-}"
LIST_ID="${3:-members.lists.example.org}"
CONNECTOR_URL="${4:-https://mailman-connector.example.com}"

# Validation
if [ -z "$CSV_FILE" ]; then
    echo "Error: CSV file argument is required"
    echo ""
    show_help
    exit 1
fi

if [ -z "$CONNECTOR_PASSWORD" ]; then
    echo "Error: Password argument is required"
    echo ""
    show_help
    exit 1
fi

if [ ! -f "$CSV_FILE" ]; then
    echo "Error: File not found: $CSV_FILE"
    exit 1
fi

# Validate CSV format
if ! grep -q ',' "$CSV_FILE"; then
    echo "Error: CSV file appears invalid (no commas found)"
    echo "Expected format: email,first_name,last_name"
    exit 1
fi

# Read CSV content
CSV_DATA=$(cat "$CSV_FILE")
if [ -z "$CSV_DATA" ]; then
    echo "Error: CSV file is empty"
    exit 1
fi

# Count members
MEMBER_COUNT=$(wc -l < "$CSV_FILE" | tr -d ' ')

echo "=========================================="
echo "LWVWV Member Subscription"
echo "=========================================="
echo "Connector URL: $CONNECTOR_URL"
echo "Target List:   $LIST_ID"
echo "CSV File:      $CSV_FILE"
echo "Members:       $MEMBER_COUNT"
echo "=========================================="
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    echo "Install with: apt-get install jq (Debian/Ubuntu) or yum install jq (RHEL/CentOS)"
    exit 1
fi

# Send to connector
echo "Subscribing members..."
echo ""

RESPONSE=$(curl -s -X POST "$CONNECTOR_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"subscribe_batch\": \"subscribe_batch\",
    \"password\": \"$CONNECTOR_PASSWORD\",
    \"list_id\": \"$LIST_ID\",
    \"csv_data\": $(echo "$CSV_DATA" | jq -R -s .)
  }")

# Check response
if echo "$RESPONSE" | jq -e . &> /dev/null; then
    echo "Response:"
    echo "$RESPONSE" | jq .
    
    # Extract summary if available
    if echo "$RESPONSE" | jq -e '.summary' &> /dev/null; then
        echo ""
        echo "Summary:"
        echo "  Total processed:     $(echo "$RESPONSE" | jq -r '.summary.total_received // "N/A"')"
        echo "  Newly subscribed:    $(echo "$RESPONSE" | jq -r '.summary.subscribed // "N/A"')"
        echo "  Already subscribed:  $(echo "$RESPONSE" | jq -r '.summary.already_subscribed // "N/A"')"
        echo "  Errors:              $(echo "$RESPONSE" | jq -r '.summary.errors // "N/A"')"
    fi
    
    # Check for errors
    if echo "$RESPONSE" | jq -e '.error' &> /dev/null; then
        echo ""
        echo "ERROR: $(echo "$RESPONSE" | jq -r '.error')"
        exit 1
    fi
else
    echo "Error: Invalid response from connector"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""
echo "Done!"
