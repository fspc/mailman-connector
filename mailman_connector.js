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
// Parse REQUESTOR_IP - support single IP or comma-separated list of IPs
const requestor = process.env.REQUESTOR_IP;
const requestor_ips = requestor ? requestor.split(',').map(ip => ip.trim()) : [];

// Parse MAILMAN_LIST_ID - support single or multiple comma-separated lists (whitelist)
const mailman_list_ids = process.env.MAILMAN_LIST_ID
  ? process.env.MAILMAN_LIST_ID.split(',').map(id => id.trim().toLowerCase())
  : [];
const default_list_id = mailman_list_ids[0] || null;

// Helper function to validate and get allowed list_id
function get_allowed_list_id(requested_list_id) {
  // If no lists configured, reject
  if (!mailman_list_ids.length) {
    throw new Error("No MAILMAN_LIST_ID configured");
  }

  // If client didn't specify, use default (first in list)
  if (!requested_list_id) {
    return default_list_id;
  }

  // Check if requested list is in allowed list (case-insensitive)
  const normalized_request = requested_list_id.toLowerCase();
  if (mailman_list_ids.includes(normalized_request)) {
    return normalized_request;
  }

  // Not allowed
  return null;
}

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

      // Check if IP is allowed (no restriction, or matches any IP in the list)
      const allowed = requestor_ips.length === 0 || requestor_ips.some(ip => realIp.includes(ip));
      if (allowed) {
        if (data.subscribe_batch === 'subscribe_batch') {
          console.log("From IP:", realIp);
          console.log("Batch subscribe request");
          handleSubscribeBatch(data, response);
        } else if (data.subscribe === 'subscribe') {
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

  // Validate list_id against whitelist
  let list_id = get_allowed_list_id(data.list_id);
  if (!list_id) {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "List not allowed" }));
    return;
  }

  let url_object = {
    list_id: list_id,
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
    // Validate list_id against whitelist
    let list_id = get_allowed_list_id(data.list_id);
    if (!list_id) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: "List not allowed" }));
      return;
    }
    let member_id = await find_member_id(data.email, list_id);
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
function find_member_id(email, list_id_override) {
  return new Promise((resolve, reject) => {
    let list_id = list_id_override || process.env.MAILMAN_LIST_ID;
    let url_object = { subscriber: email, list_id: list_id, role: 'member' };

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

// Get all members from the mailing list (handles pagination)
function get_all_members(list_id_override) {
  return new Promise((resolve, reject) => {
    let members = [];
    let page_token = null;
    let list_id = list_id_override || process.env.MAILMAN_LIST_ID;

    function fetch_page() {
      let path = '/3.1/lists/' + list_id + '/members';
      if (page_token) {
        path += '?token=' + encodeURIComponent(page_token);
      }

      let mailman_options = {
        hostname: hostname,
        port: port,
        path: path,
        method: 'GET',
        headers: { "Authorization": auth }
      };

      let req = mailman.request(mailman_options, function (res) {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            let parsed = JSON.parse(body);
            if (parsed.entries) {
              members = members.concat(parsed.entries.map(e => e.address || e.email));
            }
            if (parsed.token) {
              page_token = parsed.token;
              fetch_page();
            } else {
              resolve(members);
            }
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.end();
    }

    fetch_page();
  });
}

// Subscribe a single member
function subscribe_single(email, first_name, last_name, list_id_override) {
  return new Promise((resolve, reject) => {
    let list_id = list_id_override || process.env.MAILMAN_LIST_ID;
    let url_object = {
      list_id: list_id,
      subscriber: email,
      display_name: (first_name + ' ' + last_name).trim(),
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + body));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Handle batch subscription requests
async function handleSubscribeBatch(data, response) {
  if (secret_password !== data.password) {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    // Validate list_id against whitelist
    let list_id = get_allowed_list_id(data.list_id);
    if (!list_id) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: "List not allowed" }));
      return;
    }
    console.log("Using list: " + list_id);

    // Parse CSV data: email,first_name,last_name
    const lines = data.csv_data.split('\n').filter(l => l.trim());
    const members_to_process = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        email: parts[0],
        first_name: parts[1] || '',
        last_name: parts[2] || ''
      };
    });

    console.log("Processing " + members_to_process.length + " members");

    // Get existing subscribers
    const existing_emails = await get_all_members(list_id);
    const existing_set = new Set(existing_emails.map(e => e.toLowerCase()));
    console.log("Found " + existing_emails.length + " existing subscribers");

    // Filter out already subscribed
    const to_subscribe = members_to_process.filter(m => !existing_set.has(m.email.toLowerCase()));
    const already_subscribed = members_to_process.filter(m => existing_set.has(m.email.toLowerCase()));

    console.log("New to subscribe: " + to_subscribe.length);
    console.log("Already subscribed: " + already_subscribed.length);

    // Subscribe new ones
    let subscribed = [];
    let errors = [];

    for (const member of to_subscribe) {
      try {
        await subscribe_single(member.email, member.first_name, member.last_name, list_id);
        subscribed.push(member.email);
        console.log("Subscribed: " + member.email);
      } catch (err) {
        errors.push({ email: member.email, error: err.message });
        console.error("Failed to subscribe " + member.email + ": " + err.message);
      }
    }

    // Return results
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      success: true,
      summary: {
        total_received: members_to_process.length,
        subscribed: subscribed.length,
        already_subscribed: already_subscribed.length,
        errors: errors.length
      },
      details: {
        subscribed: subscribed,
        already_subscribed: already_subscribed.map(m => m.email),
        errors: errors
      }
    }));
  } catch (error) {
    console.error("Batch subscribe error:", error);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: "Internal server error", message: error.message }));
  }
}