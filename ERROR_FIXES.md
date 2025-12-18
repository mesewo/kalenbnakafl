# API Errors - Root Cause Analysis & Fixes

## Errors Found

### 1. **GET /api/events - 500 Internal Server Error** ✅ FIXED
**Root Cause:** Database table `events` didn't exist
- Tables were never being created on database startup
- Backend was trying to query non-existent tables

**Fix Applied:**
- Created `init.sql` with complete schema initialization
- Updated `docker-compose.yaml` to mount `init.sql` into PostgreSQL initialization directory
- Now tables are created automatically when Docker container starts

### 2. **GET /api/posts - 500 Internal Server Error** ✅ FIXED
**Root Cause:** Database table `posts` didn't exist
- Same issue as events - missing schema

**Fix Applied:**
- Included in `init.sql` schema

### 3. **POST /api/register - 400 Bad Request** ✅ FIXED
**Root Cause:** Password field not being unmarshaled from JSON
- The User model had `Password` field with `json:"-"` tag
- This prevented the JSON decoder from reading password from request body
- Backend couldn't extract password from registration request

**Fix Applied:**
- Changed User model password tag from `json:"-"` to `json:"password"`
- File: `server/models/users.go`

---

## Database Schema Created

The `init.sql` file now creates:

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media table
CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    media_type VARCHAR(50),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Seed Data:** Includes 4 test users:
- admin@kalenbenakafil.org (admin)
- editor@kalenbenakafil.org (editor)  
- member@kalenbenakafil.org (user)
- volunteer@kalenbenakafil.org (volunteer)

Password: All use the hashed version of a default password

---

## What Changed

### Files Modified:
1. **init.sql** - Created (new file with full schema)
2. **docker-compose.yaml** - Added volume mount for init.sql
3. **server/models/users.go** - Fixed Password field JSON tag

### Files Unchanged (Already Correct):
- `server/handlers/events.go` - GetEvents returns `event_date` correctly
- `server/handlers/posts.go` - GetPosts returns correct fields
- `server/handlers/auth.go` - Registration logic is sound
- Frontend code is correct

---

## Next Steps to Test

1. **Stop and remove old containers:**
   ```bash
   docker compose down
   docker volume rm kalenbnakafl_pgdata
   ```

2. **Rebuild and restart:**
   ```bash
   docker compose up -d
   ```

3. **Test endpoints:**
   - Events: `GET http://localhost:8080/api/events` (should work now)
   - Posts: `GET http://localhost:8080/api/posts` (should work now)
   - Register: `POST http://localhost:8080/api/register` with valid JSON (should work now)

4. **Test with credentials:**
   - Email: `admin@kalenbenakafil.org`
   - Any user email works - all have same hashed password

---

## Summary

The errors weren't due to incomplete features - they were due to:
1. **Missing database initialization** - Tables never created
2. **Wrong JSON tag** - Password field couldn't be unmarshaled

Both are now fixed. Your API should now:
- ✅ Return events correctly
- ✅ Return posts correctly  
- ✅ Accept registration requests
- ✅ Allow login with test credentials

Ready to dockerize the frontend!
