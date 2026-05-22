# Django/Flask/FastAPI Common Patterns and Anti-Patterns

## Django ORM Anti-Patterns

### 1. N+1 Queries
```python
# ❌ Each loop iteration triggers an extra query
orders = Order.objects.all()
for order in orders:
    print(order.user.name)  # Each order triggers a SELECT user

# ✅ select_related (ForeignKey/OneToOne, uses JOIN)
orders = Order.objects.select_related('user').all()

# ✅ prefetch_related (ManyToMany/reverse FK, uses 2 queries)
users = User.objects.prefetch_related('orders').all()
```

### 2. Calling save() in a loop
```python
# ❌ N INSERT/UPDATE operations
for item in items:
    obj = MyModel(name=item['name'], value=item['value'])
    obj.save()

# ✅ Bulk operations
MyModel.objects.bulk_create([
    MyModel(name=item['name'], value=item['value'])
    for item in items
])
```

### 3. Evaluating queryset prematurely for checking
```python
# ❌ count() then fetch data = two queries
if queryset.count() > 0:
    items = list(queryset)

# ✅ Fetch data directly, use bool to check
items = list(queryset)
if items:
    ...

# ✅ Only check existence
if queryset.exists():
    ...
```

## Flask Anti-Patterns

### 1. Routes missing error handling
```python
# ❌ Exception exposed directly to client
@app.route('/users/<int:user_id>')
def get_user(user_id):
    user = db.session.get(User, user_id)  # May return None
    return jsonify(user.to_dict())  # AttributeError: None has no attr 'to_dict'

# ✅ Check and return appropriate error
@app.route('/users/<int:user_id>')
def get_user(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        abort(404, description=f"User {user_id} not found")
    return jsonify(user.to_dict())
```

### 2. Global state dependency
```python
# ❌ Module-level mutable variable (not shared across workers, thread-safety issues)
cache = {}

@app.route('/data')
def get_data():
    if 'key' not in cache:
        cache['key'] = expensive_compute()
    return cache['key']

# ✅ Use Flask extensions or external cache
from flask_caching import Cache
cache = Cache(app, config={'CACHE_TYPE': 'redis'})

@app.route('/data')
@cache.cached(timeout=300)
def get_data():
    return expensive_compute()
```

## FastAPI Best Practices

### 1. Pydantic model separation
```python
# ✅ Separate request/response/database models
class UserCreate(BaseModel):
    name: str
    email: EmailStr

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    model_config = ConfigDict(from_attributes=True)

class UserInDB(UserResponse):
    hashed_password: str
```

### 2. Dependency injection
```python
# ✅ Use Depends to inject database session
async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/users/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404)
    return user
```

## General Python Web Security

### YAML safe loading
```python
# ❌ Can execute arbitrary Python code
data = yaml.load(user_input)

# ✅ Safe loading
data = yaml.safe_load(user_input)
```

### Environment variable management
```python
# ❌ Hardcoded secrets
SECRET_KEY = "my-super-secret-key-123"

# ✅ Read from environment variables
import os
SECRET_KEY = os.environ["SECRET_KEY"]  # Fails immediately if missing

# ✅ Use pydantic-settings
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    secret_key: str
    database_url: str
    debug: bool = False

    model_config = ConfigDict(env_file='.env')
```
