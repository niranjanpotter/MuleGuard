%dw 2.0
output application/json
---
{
  channel: vars.initialRequest.channel,
  guarded: payload.a.b.c default "",
  unguarded: payload.a.b.c
}
