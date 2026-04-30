---
name: cron-management
description: Schedule and manage recurring jobs — list, create, trigger, edit, and delete cron jobs on a device.
---

# Cron Management

Manage scheduled recurring jobs on the active device.

## When to use

- User wants to schedule automated work
- Viewing or modifying existing cron jobs
- Manually triggering a cron job
- Debugging why a scheduled job didn't run

## Workflows

### List Cron Jobs
1. Call `cron.list()`
2. Present: name, schedule (cron expression), last run, next run, status

### Create a Cron Job
1. Gather: name, cron schedule expression, command/action to run
2. Call `cron.add({ name, schedule, command, ...config })`
3. Confirm with the cron ID and next scheduled run

### Manually Trigger
1. Call `cron.run(cronId)` — **this has a 180s timeout** (long operation)
2. Wait for the result
3. Report success/failure and any output

### Edit a Cron Job
1. Call `cron.edit(cronId, { ...changes })`
2. Confirm the updated schedule/config

### Delete a Cron Job
1. Confirm with the user
2. Call `cron.delete(cronId)`

## Cron Expression Reference

```
┌────── minute (0-59)
│ ┌──── hour (0-23)
│ │ ┌── day of month (1-31)
│ │ │ ┌ month (1-12)
│ │ │ │ ┌ day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

Common patterns:
- `*/5 * * * *` — every 5 minutes
- `0 9 * * 1-5` — 9 AM weekdays
- `0 0 * * *` — midnight daily
- `0 */6 * * *` — every 6 hours

## Important

- Cron jobs execute on the device, not in the Hub
- Manual trigger (`cron.run`) can take up to 3 minutes
- If the device goes offline, scheduled jobs won't run until it's back
