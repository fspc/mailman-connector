#!/bin/bash
# Test script for batch subscribing members from an existing CSV file
# Usage: ./test-subscribe-members.sh <csv_file> [list_id]
#
# Example:
#   ./test-subscribe-members.sh test.csv
#   ./test-subscribe-members.sh test.csv listname.atlists.coollists.org 

# Configuration
CONNECTOR_URL="https://mailman-connector.coollists.org"
CONNECTOR_PASSWORD="${CONNECTOR_PASSWORD:-your_secret_password}"
LIST_ID="${2:-listname.atlists.coollists.org}"
CSV_FILE="$1"

# Check if CSV file is provided
if [ -z "$CSV_FILE" ]; then
    echo "Usage: $0 <csv_file> [list_id]"
    echo ""
    echo "Arguments:"
    echo "  csv_file    Path to CSV file with format: email,first_name,last_name"
    echo "  list_id     Optional: Target mailing list (default: listname.atlists.coollists.org)"
    echo ""
    echo "Examples:"
    echo "  $0 test.csv"
    echo "  $0 members.csv listname.atlists.coollists.org"
    echo ""
    echo "Environment Variables:"
    echo "  CONNECTOR_PASSWORD    Secret password for connector (can also be set via env)"
    exit 1
fi

# Check if file exists
if [ ! -f "$CSV_FILE" ]; then
    echo "Error: File not found: $CSV_FILE"
    exit 1
fi

# Validate CSV file format (basic check)
if ! grep -q ',' "$CSV_FILE"; then
    echo "Error: CSV file appears invalid (no commas found)"
    echo "Expected format: email,first_name,last_name"
    exit 1
fi

# Read CSV content
CSV_DATA=$(cat "$CSV_FILE")

# Count members
MEMBER_COUNT=$(wc -l < "$CSV_FILE" | tr -d ' ')

echo "=========================================="
echo "Mailman Connector - Batch Subscribe Test"
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
echo "Sending request to connector..."
echo ""

RESPONSE=$(curl -s -X POST "$CONNECTOR_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"subscribe_batch\": \"subscribe_batch\",
    \"password\": \"$CONNECTOR_PASSWORD\",
    \"list_id\": \"$LIST_ID\",
    \"csv_data\": $(echo "$CSV_DATA" | jq -R -s .)
  }")

# Check if response is valid JSON
if echo "$RESPONSE" | jq -e . &> /dev/null; then
    echo "Response:"
    echo "$RESPONSE" | jq .
    
    # Extract summary if available
    if echo "$RESPONSE" | jq -e '.summary' &> /dev/null; then
        echo ""
        echo "Summary:"
        echo "  Total received:      $(echo "$RESPONSE" | jq -r '.summary.total_received // "N/A"')"
        echo "  Subscribed:          $(echo "$RESPONSE" | jq -r '.summary.subscribed // "N/A"')"
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
