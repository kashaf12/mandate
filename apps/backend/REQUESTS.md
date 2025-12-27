# API Requests Collection

Quick reference for testing all API endpoints. Use with `curl`, Postman, or any HTTP client.

**Base URL**: `http://localhost:3000`

## Agents API

### Create Agent

```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "principal": "test@example.com",
    "environment": "production"
  }'
```

**Response**: Returns agent with `apiKey` (save this for subsequent requests)

### List All Agents

```bash
curl -X GET http://localhost:3000/agents
```

### Get Agent by ID

```bash
curl -X GET http://localhost:3000/agents/agent-abc123
```

### Update Agent

```bash
curl -X PUT http://localhost:3000/agents/agent-abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Agent Name",
    "status": "active"
  }'
```

### Delete Agent (Soft Delete)

```bash
curl -X DELETE http://localhost:3000/agents/agent-abc123
```

## Policies API

### Create Policy

```bash
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Free Tier Policy",
    "description": "Policy for free tier users",
    "authority": {
      "maxCostTotal": 1.0,
      "maxCostPerCall": 0.1,
      "allowedTools": ["web_search", "read_file"],
      "deniedTools": ["delete_file"],
      "rateLimit": {
        "maxCalls": 100,
        "windowMs": 3600000
      },
      "executionLimits": {
        "maxSteps": 50,
        "maxToolCalls": 20,
        "maxTokensPerCall": 4000,
        "maxExecutionTime": 300000
      },
      "modelConfig": {
        "temperature": 0.7,
        "maxTokens": 2000,
        "allowedModels": ["gpt-4", "gpt-3.5-turbo"]
      }
    }
  }'
```

### List All Policies

```bash
# All policies
curl -X GET http://localhost:3000/policies

# Active policies only
curl -X GET "http://localhost:3000/policies?active=true"
```

### Get Policy by ID

```bash
# Latest version
curl -X GET http://localhost:3000/policies/policy-abc123

# Specific version
curl -X GET "http://localhost:3000/policies/policy-abc123?version=1"
```

### Update Policy (Creates New Version)

```bash
curl -X PUT http://localhost:3000/policies/policy-abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "authority": {
      "maxCostTotal": 2.0,
      "allowedTools": ["web_search"]
    }
  }'
```

### Archive Policy

```bash
# Archive all versions
curl -X DELETE http://localhost:3000/policies/policy-abc123

# Archive specific version
curl -X DELETE "http://localhost:3000/policies/policy-abc123?version=1"
```

## Rules API

### Create Rule

```bash
curl -X POST http://localhost:3000/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Free Tier Rule",
    "description": "Applies free tier policy to free users",
    "policyId": "policy-abc123",
    "agentIds": ["agent-abc123"],
    "matchMode": "AND",
    "conditions": [
      {
        "field": "user_tier",
        "operator": "==",
        "value": "free"
      },
      {
        "field": "environment",
        "operator": "==",
        "value": "production"
      }
    ]
  }'
```

### List All Rules

```bash
# All rules
curl -X GET http://localhost:3000/rules

# Active rules only
curl -X GET "http://localhost:3000/rules?active=true"
```

### Get Rule by ID

```bash
curl -X GET http://localhost:3000/rules/rule-abc123
```

### Update Rule (Creates New Version)

```bash
curl -X PUT http://localhost:3000/rules/rule-abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "conditions": [
      {
        "field": "user_tier",
        "operator": "==",
        "value": "premium"
      }
    ]
  }'
```

### Archive Rule

```bash
curl -X DELETE http://localhost:3000/rules/rule-abc123
```

## Mandates API

**Note**: All mandate endpoints require API key authentication.

### Issue Mandate

```bash
# Replace YOUR_API_KEY with actual API key from agent creation
curl -X POST http://localhost:3000/mandates/issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "context": {
      "user_tier": "free",
      "environment": "production",
      "region": "us-east-1"
    }
  }'
```

**Response**: Returns mandate with `mandateId`, `effectiveAuthority`, and `expiresAt`

### Get Mandate Details

```bash
curl -X GET http://localhost:3000/mandates/mnd-abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response**: Returns detailed mandate including matched rules and applied policies

## Health Check

### Health Endpoint

```bash
curl -X GET http://localhost:3000/health
```

## Swagger Documentation

Access interactive API documentation at:

```
http://localhost:3000/api
```

## Example Workflow

1. **Create Agent**

   ```bash
   curl -X POST http://localhost:3000/agents \
     -H "Content-Type: application/json" \
     -d '{"name": "My Agent", "environment": "production"}'
   ```

   Save the `apiKey` from response.

2. **Create Policy**

   ```bash
   curl -X POST http://localhost:3000/policies \
     -H "Content-Type: application/json" \
     -d '{"name": "My Policy", "authority": {...}}'
   ```

   Save the `policy_id` from response.

3. **Create Rule**

   ```bash
   curl -X POST http://localhost:3000/rules \
     -H "Content-Type: application/json" \
     -d '{"name": "My Rule", "policyId": "policy-xxx", "conditions": [...]}'
   ```

4. **Issue Mandate**
   ```bash
   curl -X POST http://localhost:3000/mandates/issue \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -d '{"context": {"user_tier": "free"}}'
   ```

## Postman Collection

You can import these requests into Postman:

1. Create a new collection "Mandate API"
2. Set base URL variable: `{{baseUrl}} = http://localhost:3000`
3. Set API key variable: `{{apiKey}} = YOUR_API_KEY`
4. Create requests using the examples above, replacing:
   - `http://localhost:3000` with `{{baseUrl}}`
   - `YOUR_API_KEY` with `{{apiKey}}`

## Environment Variables

For different environments, set:

- **Development**: `http://localhost:3000`
- **Staging**: `https://staging-api.mandate.com`
- **Production**: `https://api.mandate.com`
