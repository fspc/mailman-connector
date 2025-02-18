const http = require('http');
const querystring = require('querystring');
const secret_password = process.env.SECRET_PASSWORD;

const username = process.env.MAILMAN_USERNAME;
const password = process.env.MAILMAN_PASSWORD;
const hostname = process.env.HOSTNAME;
const port = process.env.PORT
const buf = Buffer.from(username + ":" + password);
const auth = "Basic " + buf.toString("base64");
const mailman = require('http');
const requestor = process.env.REQUESTOR_IP

// Server loop
const server = http.createServer(function (request, response) {

  response.writeHead(200, { 'Content-Type': 'application/json' });

  let body = '';
  let receivedBytes = 0;
  const MAX_BODY_SIZE = 1e6; // 1MB limit to prevent DoS attacks

  request.on('data', function (chunk) {
    receivedBytes += chunk.length;
    // console.log("Received chunk:", chunk.toString()); // Log each received chunk

    if (receivedBytes > MAX_BODY_SIZE) {
      console.warn("Request body too large, potential DoS attack detected.");
      response.writeHead(413, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: "Request entity too large" }));
      request.connection.destroy();
      return;
    }
    body += chunk;
  });

  request.on('end', function () {
    // console.log("Final accumulated body before parsing:", body);

    try {
      let data = JSON.parse(body);
      let realIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;

      if ((requestor && realIp.includes(requestor)) || !requestor) {
        if (data.subscribe === 'subscribe') {
          console.log("From IP:", realIp);
          console.log("Data", data);
          handleSubscribe(data, response);
        } else {
          console.log("From IP:", realIp);
          console.log("Data", data);
          handleUnsubscribe(data, response);
        }
      } else {
        // Handle the case where the `requestor` does not match or is empty 
        console.log("Requestor does not match the real IP or is empty.");
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: "Requestor does not match IP" }));
      }
    } catch (error) {
      console.error("Invalid JSON received:", body);
      let realIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
      console.warn("Potential malicious request detected from IP:", realIp);
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: "Invalid JSON format" }));
    }
  });
});

server.on('error', function (e) {
  console.error(e);
});

server.listen(Number(process.argv[2]));

// Handle subscription requests
function handleSubscribe(data, response) {
  if (secret_password !== data.password) {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let url_object = {
    list_id: process.env.MAILMAN_LIST_ID,
    subscriber: data.email,
    display_name: data.first_name + ' ' + data.last_name,
    pre_verified: 'True',
    pre_confirmed: 'True',
    pre_approved: 'True'
  };

  let mailman_options = {
    hostname: hostname,
    port: port,
    path: '/3.1/members?' + querystring.stringify(url_object),
    method: 'POST',
    headers: { "Authorization": auth }
  };

  let req = mailman.request(mailman_options, function (res) {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(body);
    });
  });
  req.on('error', (err) => {
    console.error(err);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Internal server error" }));
  });
  req.end();
}

// Handle unsubscription requests
async function handleUnsubscribe(data, response) {
  if (secret_password !== data.password) {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  try {
    let member_id = await find_member_id(data.email);
    if (member_id) {
      await unsubscribe_member_id(member_id, response);
    } else {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: "Member not found" }));
    }
  } catch (error) {
    console.error("Error handling unsubscribe:", error);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// Find member in mailing list
function find_member_id(email) {
  return new Promise((resolve, reject) => {
    let url_object = { subscriber: email, list_id: process.env.MAILMAN_LIST_ID, role: 'member' };

    let mailman_options = {
      hostname: hostname,
      port: port,
      path: '/3.1/members/find?' + querystring.stringify(url_object),
      method: 'GET',
      headers: { "Authorization": auth }
    };

    let req = mailman.request(mailman_options, function (res) {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          let parsed = JSON.parse(body);
          resolve(parsed.entries && parsed.entries.length > 0 ? parsed.entries[0].member_id : null);
        } catch (err) {
          reject(new Error("Error parsing JSON response"));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Unsubscribe member
function unsubscribe_member_id(member_id, response) {
  let mailman_options = {
    hostname: hostname,
    port: port,
    path: '/3.1/members/' + member_id,
    method: 'DELETE',
    headers: { "Authorization": auth }
  };

  let req = mailman.request(mailman_options, function (res) {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(body);
    });
  });
  req.on('error', (err) => {
    console.error(err);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Internal server error" }));
  });
  req.end();
}