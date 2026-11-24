%dw 2.0
output application/json
---
{
  name: payload.customer.name,
  age: payload.customer.age,
  email: payload.customer.email default '',
  status: if (payload.customer.tier != null) payload.customer.tier else 'STANDARD'
}
