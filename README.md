# Mailman Connector

This program provides an API server to receive requests to subscribe and unsubscribe users from a MailMan 3 email list. The requester must provide a secret password to utilize the service.

Mailman Connector is designed to run on the same host as a Dockerized version of Mailman and shares the same Docker network (`mailman`). This setup ensures that you don't need to expose Mailman's API publicly. The `HOSTNAME` environment variable should be set to the Docker service name specified for `mailman-core` provided by `maxking/mailman-core`.

## Example Request Code (PHP)
Here's an example of how to send a request using PHP:
```
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

    // $ssl_certificate = SSL_CERTIFICATE;
    // if( !defined( 'SSL_CERTIFICATE' ) ) define ("SSL_CERTIFICATE", "/var/www/html/examples/cert.pem");
    if ($ssl_certificate) {
        $curlConfig[CURLOPT_CAINFO] = $ssl_certificate;
    }

    curl_setopt_array($ch, $curlConfig);
    $result = curl_exec($ch);
    curl_close($ch);

    echo $result;
```

## Environmental Variables for `docker-compose.yml`
Set the following environment variables in your `docker-compose.yml` file:
```
SECRET_PASSWORD=mypassword
MAILMAN_USERNAME=rest-administrator-username
MAILMAN_PASSWORD=password-for-restadmin
MAILMAN_LIST_ID=listname.atlists.coollists.org
LETSENCRYPT_HOST=myhost.org # Uses nginxproxy/acme-companion
LOGLEVEL=warn
ENV=production
HOST_PORT=10000
CONTAINER_PORT=10000
REQUESTOR_IP=1.1.1.1 # Optional, but limits request to a specific IP
HOSTNAME=mailman-core
PORT=8001
```