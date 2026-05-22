# Spring Boot Common Anti-Patterns and Best Practices

## Transaction Management Anti-Patterns

### 1. @Transactional on private methods
```java
// ❌ Spring AOP is proxy-based, @Transactional on private methods has no effect
@Transactional
private void updateUser(User user) { ... }

// ✅ Must be on public methods
@Transactional
public void updateUser(User user) { ... }
```

### 2. Self-invocation bypasses transaction
```java
@Service
public class OrderService {
    // ❌ Internal call bypasses proxy, @Transactional has no effect
    public void createOrder(Order order) {
        this.saveOrder(order); // Direct call, skips AOP proxy
    }

    @Transactional
    public void saveOrder(Order order) { ... }
}

// ✅ Solution 1: Inject self (via interface)
// ✅ Solution 2: Move transactional method to another Service
// ✅ Solution 3: Use TransactionTemplate for programmatic transactions
```

### 3. Transaction scope too large
```java
// ❌ Entire method in transaction, including remote calls
@Transactional
public void processOrder(Order order) {
    orderDao.save(order);
    emailService.send(order.getUser()); // Remote call shouldn't be in transaction
    logService.log(order);              // Logging doesn't need transaction protection
}

// ✅ Narrow the transaction scope
public void processOrder(Order order) {
    saveOrderInTransaction(order);
    emailService.send(order.getUser());
    logService.log(order);
}

@Transactional
public void saveOrderInTransaction(Order order) {
    orderDao.save(order);
}
```

## Bean Management Anti-Patterns

### 1. Singleton injecting Prototype
```java
// ❌ Prototype Bean only created once (since singleton initializes only once)
@Component
public class SingletonService {
    @Autowired
    private PrototypeBean prototypeBean; // Always the same instance
}

// ✅ Solution 1: Use ObjectProvider
@Component
public class SingletonService {
    @Autowired
    private ObjectProvider<PrototypeBean> prototypeBeanProvider;

    public void doWork() {
        PrototypeBean bean = prototypeBeanProvider.getObject(); // New instance each time
    }
}
```

### 2. Constructor injection vs field injection
```java
// ❌ Field injection: harder to test, dependencies not visible
@Service
public class UserService {
    @Autowired
    private UserRepository userRepo;
    @Autowired
    private EmailService emailService;
}

// ✅ Constructor injection: explicit dependencies, easy to test
@Service
@RequiredArgsConstructor // Lombok
public class UserService {
    private final UserRepository userRepo;
    private final EmailService emailService;
}
```

## MyBatis Security

### ${} vs #{}
```xml
<!-- ❌ ${} directly concatenates SQL, injection risk -->
<select id="findUsers">
    SELECT * FROM users ORDER BY ${orderColumn}
</select>

<!-- ✅ #{} uses prepared statement parameters -->
<select id="findUser">
    SELECT * FROM users WHERE id = #{id}
</select>

<!-- ✅ Dynamic sorting with whitelist -->
<select id="findUsers">
    SELECT * FROM users
    ORDER BY
    <choose>
        <when test="orderColumn == 'name'">name</when>
        <when test="orderColumn == 'age'">age</when>
        <otherwise>id</otherwise>
    </choose>
</select>
```

## Logging Best Practices

```java
// ❌ String concatenation: executed even when log level is insufficient
logger.debug("Processing user: " + user.toString() + " with order: " + order.toString());

// ✅ Use placeholders: toString() not called when log level is insufficient
logger.debug("Processing user: {} with order: {}", user.getId(), order.getId());

// ❌ Logging sensitive information
logger.info("User login: password={}", password);

// ✅ Mask sensitive data
logger.info("User login: userId={}", userId);
```
