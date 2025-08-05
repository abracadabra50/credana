# Database Architecture for Credana

## Why Not Supabase?

While Supabase is excellent for many applications, our credit card authorization system has unique requirements:

### 1. **Sub-500ms Authorization Requirements**
- Card authorizations need responses in <500ms (Stripe's timeout)
- Supabase adds network latency (API calls)
- Need direct Redis access for position caching

### 2. **High-Frequency Writes**
- Every card swipe = blockchain transaction + database writes
- Need optimised write paths and connection pooling
- Custom indexing strategies for time-series data

### 3. **Complex Caching Layer**
- Position data must be in-memory (Redis)
- Custom cache invalidation on blockchain events
- Multi-level caching (L1: Redis, L2: PostgreSQL)

### 4. **Financial Compliance**
- Need direct database access for audit trails
- Custom backup strategies for financial data
- Encryption at rest with HSM key management

## Recommended Architecture

### Primary Stack
```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Redis Cluster │────▶│  PostgreSQL  │────▶│  TimescaleDB    │
│  (Position Cache)│     │ (Primary DB) │     │ (Analytics)     │
└─────────────────┘     └──────────────┘     └─────────────────┘
         │                       │                      │
         ▼                       ▼                      ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Auth Service   │     │   API Layer  │     │  Reconciliation │
│   (<500ms)      │     │              │     │     Jobs        │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

### Database Technologies

#### 1. Redis Cluster (Required)
- **Purpose**: Real-time position cache
- **Data**: Current positions, health factors, credit limits
- **Why**: Sub-millisecond reads for authorization

#### 2. PostgreSQL 15+ (Primary)
- **Purpose**: System of record
- **Features**: 
  - JSONB for flexible card event data
  - Partitioning for time-series data
  - Row-level security for multi-tenancy
- **Extensions**: pgcrypto, uuid-ossp, timescaledb

#### 3. TimescaleDB (Analytics)
- **Purpose**: Historical analysis
- **Data**: Transaction history, risk metrics
- **Why**: Optimised for time-series queries

### Critical Database Patterns

#### 1. Write-Through Cache
```typescript
// Authorize transaction
async function authorizeTransaction(userId, amount) {
  // 1. Read from Redis (1-2ms)
  const position = await redis.get(`position:${userId}`);
  
  // 2. Calculate approval
  if (checkHealthFactor(position, amount)) {
    // 3. Write to Redis immediately
    await redis.setex(`pending:${txId}`, 300, amount);
    
    // 4. Queue PostgreSQL write (async)
    await queue.push({ type: 'auth', userId, amount });
    
    return { approved: true };
  }
}
```

#### 2. Event-Driven Cache Invalidation
```typescript
// Blockchain indexer
async function handleBlockchainEvent(event) {
  // Update PostgreSQL
  await db.positions.update(event.userId, event.data);
  
  // Invalidate Redis cache
  await redis.del(`position:${event.userId}`);
  
  // Rebuild cache with fresh data
  await rebuildUserCache(event.userId);
}
```

### Database Schema Overview

```sql
-- Core tables with partitioning
CREATE TABLE card_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(20,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- Optimised indexes
CREATE INDEX idx_card_events_user_created 
  ON card_events (user_id, created_at DESC);

-- Materialized view for quick lookups
CREATE MATERIALIZED VIEW user_position_summary AS
  SELECT user_id, 
         SUM(debt_usdc) as total_debt,
         MAX(health_factor) as current_hf
  FROM positions
  GROUP BY user_id;
```

### Performance Optimizations

1. **Connection Pooling**: PgBouncer for PostgreSQL
2. **Read Replicas**: Separate analytics queries
3. **Sharding**: Redis cluster by user_id
4. **Compression**: ZSTD for historical data

### Monitoring & Compliance

1. **Audit Logging**: Every financial operation
2. **Point-in-Time Recovery**: 30-day retention
3. **Encryption**: TDE for data at rest
4. **Access Control**: IAM + database roles

## Alternative Considerations

If you prefer managed solutions:

1. **AWS RDS + ElastiCache**
   - Managed PostgreSQL + Redis
   - VPC peering for low latency
   - Built-in compliance features

2. **Neon + Upstash**
   - Serverless PostgreSQL + Redis
   - Good for development/testing
   - May not meet production latency needs

3. **Hybrid Approach**
   - Supabase for user management/auth
   - Direct PostgreSQL for financial data
   - Dedicated Redis for authorization

The key is maintaining <500ms authorization response times while ensuring data consistency and compliance. 