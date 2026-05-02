# Mailman Connector

A secure API bridge for Mailman 3 that enables subscription management without exposing the Mailman REST API publicly. Designed to run alongside Dockerized Mailman Core on the same Docker network.

Mailman Connector is designed to run on the same host as a Dockerized version of Mailman and shares the same Docker network (`mailman`). This setup ensures that you don't need to expose Mailman's API publicly. The `HOSTNAME` environment variable should be set to the Docker service name specified for `mailman-core` provided by `maxking/mailman-core`.

## Quick Start

1. **Configure environment variables** in `.env` or `docker-compose.yml`:
```bash
SECRET_PASSWORD=your_secret_password
MAILMAN_USERNAME=rest-admin
MAILMAN_PASSWORD=rest_password
MAILMAN_LIST_ID=list.domain.org,test.lists.domain.org
HOSTNAME=mailman-core
PORT=8001
HOST_PORT=10000
REQUESTOR_IP=1.2.3.4,5.6.7.8
```

2. **Start the container**:
```bash
docker-compose up -d
```

3. **Test with curl** (single subscribe):
```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{"subscribe":"subscribe","password":"your_secret_password","email":"test@example.com","first_name":"Test","last_name":"User"}'
```

   Or test batch subscribe (multiple members at once):
```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{"subscribe_batch":"subscribe_batch","password":"your_secret_password","csv_data":"user1@example.com,John,Doe\nuser2@example.com,Jane,Smith"}'
```

## Features

- **Single Subscribe**: Add individual members to mailing lists
- **Batch Subscribe**: Subscribe multiple members from CSV data with automatic duplicate detection
- **Unsubscribe**: Remove members from mailing lists
- **List Whitelist**: Control which mailing lists clients can access via `MAILMAN_LIST_ID`
- **IP Restrictions**: Limit access by IP address with support for multiple IPs
- **Security**: Secret password authentication, optional IP whitelisting, HTTPS support

## Environmental Variables

Set these in your `docker-compose.yml` or `.env` file:

```yaml
# Required
SECRET_PASSWORD=your_secret_password
MAILMAN_USERNAME=rest-administrator-username
MAILMAN_PASSWORD=password-for-restadmin
MAILMAN_LIST_ID=list.domain.org
HOSTNAME=mailman-core
PORT=8001

# Optional
HOST_PORT=10000
CONTAINER_PORT=10000
REQUESTOR_IP=1.2.3.4,5.6.7.8
LETSENCRYPT_HOST=connector.example.com
LOGLEVEL=warn
ENV=production
```

### MAILMAN_LIST_ID Configuration

Control which mailing lists clients can access:

```bash
# Single list (backward compatible)
MAILMAN_LIST_ID=list.domain.org

# Multiple allowed lists (first is default)
MAILMAN_LIST_ID=list.domain.org,test.lists.domain.org,dev.lists.domain.org
```

When multiple lists are configured, clients can specify `list_id` in requests. Only whitelisted lists are permitted.

### REQUESTOR_IP Configuration

Restrict access by IP address:

```bash
# Single IP
REQUESTOR_IP=1.2.3.4

# Multiple IPs (comma-separated)
REQUESTOR_IP=1.2.3.4,5.6.7.8,9.10.11.12

# No restriction (allow all)
REQUESTOR_IP=
```

## Request Formats

### Single Subscribe (Default List)

Subscribe an individual member using the default list (first in `MAILMAN_LIST_ID`):

```json
{
  "subscribe": "subscribe",
  "password": "your_secret_password",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

### Single Subscribe (Override List)

Subscribe to a specific list (must be in whitelist):

```json
{
  "subscribe": "subscribe",
  "password": "your_secret_password",
  "list_id": "test.lists.domain.org",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

### Batch Subscribe (Default List)

Subscribe multiple members from CSV data:

```json
{
  "subscribe_batch": "subscribe_batch",
  "password": "your_secret_password",
  "csv_data": "user1@example.com,John,Doe\nuser2@example.com,Jane,Smith\nuser3@example.com,Bob,Johnson"
}
```

### Batch Subscribe (Override List)

```json
{
  "subscribe_batch": "subscribe_batch",
  "password": "your_secret_password",
  "list_id": "test.lists.domain.org",
  "csv_data": "user1@example.com,John,Doe\nuser2@example.com,Jane,Smith"
}
```

### Unsubscribe (Default List)

Remove a member from the default list:

```json
{
  "password": "your_secret_password",
  "email": "user@example.com"
}
```

### Unsubscribe (Override List)

```json
{
  "password": "your_secret_password",
  "list_id": "test.lists.domain.org",
  "email": "user@example.com"
}
```

## Testing with curl

### 1. Single Subscribe (Default List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "subscribe": "subscribe",
    "password": "secret",
    "email": "test1@example.com",
    "first_name": "Alice",
    "last_name": "Anderson"
  }'
```

### 2. Single Subscribe (Override List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "subscribe": "subscribe",
    "password": "secret",
    "list_id": "test.lists.example.org",
    "email": "test2@example.com",
    "first_name": "Bob",
    "last_name": "Brown"
  }'
```

### 3. Batch Subscribe (Default List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "subscribe_batch": "subscribe_batch",
    "password": "secret",
    "csv_data": "user1@example.com,John,Doe\nuser2@example.com,Jane,Smith"
  }'
```

### 4. Batch Subscribe (Override List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "subscribe_batch": "subscribe_batch",
    "password": "secret",
    "list_id": "test.lists.example.org",
    "csv_data": "user3@example.com,Mike,Johnson\nuser4@example.com,Sarah,Williams"
  }'
```

### 5. Unsubscribe (Default List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "password": "secret",
    "email": "test1@example.com"
  }'
```

### 6. Unsubscribe (Override List)

```bash
curl -X POST https://mailman-connector.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "password": "secret",
    "list_id": "test.lists.example.org",
    "email": "test2@example.com"
  }'
```

## Example Request Code (PHP)

Here's an example of how to send a request using PHP:

```php
<?php
$json = array(
    'subscribe' => $_POST['email_list_connector'],
    'password' => $email_list_connector_password,
    'email' => $_POST['email'],
    'first_name' => $_POST['first_name'],
    'last_name' => $_POST['last_name'],
);

$ch = curl_init();
$curlConfig = array(
    CURLOPT_URL => $email_list_connector,
    CURLOPT_POST => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS => json_encode($json),
);

if ($ssl_certificate) {
    $curlConfig[CURLOPT_CAINFO] = $ssl_certificate;
}

curl_setopt_array($ch, $curlConfig);
$result = curl_exec($ch);
curl_close($ch);

echo $result;
?>
```

## Test Scripts

### test-subscribe-members.sh

Test batch subscription from an existing CSV file (standalone, no external dependencies).

**Usage:**
```bash
./test-subscribe-members.sh <csv_file> <password> [list_id] [connector_url]
```

**Arguments:**
- `csv_file` - Path to CSV file with format: email,first_name,last_name
- `password` - Secret password for the mailman-connector (required)
- `list_id` - Target mailing list (default: members.lists.example.org)
- `connector_url` - URL of the mailman-connector (default: https://mailman-connector.example.com)

**Examples:**
```bash
# Using default list and connector URL
./test-subscribe-members.sh members.csv mysecretpassword

# With specific list
./test-subscribe-members.sh members.csv mysecretpassword test.lists.example.org

# With specific list and connector URL
./test-subscribe-members.sh members.csv mysecretpassword test.lists.example.org https://connector.example.com
```

**CSV Format:**
```csv
user1@example.com,John,Doe
user2@example.com,Jane,Smith
user3@example.com,Bob,Johnson
```

## Response Format

### Success Response (Single Subscribe)

Returns Mailman 3 API response (member details).

### Success Response (Batch Subscribe)

```json
{
  "success": true,
  "summary": {
    "total_received": 3,
    "subscribed": 1,
    "already_subscribed": 2,
    "errors": 0
  },
  "details": {
    "subscribed": ["user3@example.com"],
    "already_subscribed": ["user1@example.com", "user2@example.com"],
    "errors": []
  }
}
```

### Success Response (Unsubscribe)

Returns empty body on success (HTTP 200).

### Error Responses

| HTTP Status | Error | Description |
|-------------|-------|-------------|
| 400 | Requestor does not match IP | Client IP not in `REQUESTOR_IP` whitelist |
| 400 | Invalid JSON format | Malformed JSON in request body |
| 403 | Unauthorized | Wrong `password` provided |
| 403 | List not allowed | Requested `list_id` not in `MAILMAN_LIST_ID` whitelist |
| 404 | Member not found | Email not found during unsubscribe |
| 413 | Request entity too large | Request body exceeds 1MB |
| 500 | Internal server error | Server or Mailman API error |

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐     HTTP      ┌─────────────┐
│   Client    │ ──────────────> │ Mailman Connector │ ────────────> │ Mailman Core│
│  (PHP/curl) │                 │   (this service)  │               │  (port 8001)│
└─────────────┘                 └──────────────────┘               └─────────────┘
                                       │
                                       │ Docker network: mailman
                                       │
                                ┌─────────────┐
                                │   Secret    │
                                │  Password   │
                                └─────────────┘
```

## Security Considerations

1. **Always use HTTPS** in production
2. **Use strong SECRET_PASSWORD** (random, 32+ characters)
3. **Restrict REQUESTOR_IP** to known client IPs
4. **Limit MAILMAN_LIST_ID** to only needed lists
5. **Monitor logs** for unauthorized access attempts
6. **Keep Mailman Core** on internal Docker network only

## License

GNU Lesser General Public License v3.0
