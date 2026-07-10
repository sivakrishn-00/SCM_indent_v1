from app.core.database import SessionLocal, Base, engine
from app.core.security import get_password_hash
from app.models.user import User

def seed_db():
    print("Seeding database...")
    db = SessionLocal()
    try:
        # Create Default Admin User
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@bitindent.com",
                hashed_password=get_password_hash("bit-indent-admin-bavya"),
                role="admin",
                is_active=True,
                project=None
            )
            db.add(admin_user)
            print("Default admin user created: admin / bit-indent-admin-bavya")
        else:
            print("Admin user already exists. Enforcing project to to None.")
            admin_user.project = None

        db.commit()
        print("Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
