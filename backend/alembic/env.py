import sys
import os
from logging.config import fileConfig
from sqlalchemy import pool, create_engine
from alembic import context

# Add the parent directory to the path so we can import 'app'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.config import settings
from app.core.database import Base
# Import all models to ensure they are registered on Base.metadata for autogenerate
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.consumable import Consumable
from app.models.shift import ShiftLog
from app.models.indent import Indent
from app.models.drug import DrugMaster
from app.models.office_inventory import OfficeInventory
from app.models.transit_inventory import TransitInventory
from app.models.audit_log import AuditLog
from app.models.project_config import ProjectApprovalConfig
from app.models.permission import RolePermission
from app.models.roster import ShiftRoster
from app.models.api_config import APISetting

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = settings.SQLALCHEMY_DATABASE_URI
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Create engine dynamically using settings from our .env file
    connectable = create_engine(
        settings.SQLALCHEMY_DATABASE_URI,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Check if the database was already initialized manually without migrations.
        # If 'alembic_version' is missing but 'consumables' is present, stamp the db to head.
        import sqlalchemy as sa
        inspector = sa.inspect(connection)
        tables = inspector.get_table_names()
        if "alembic_version" not in tables and "consumables" in tables:
            print("Database tables already exist. Stamping revision to head (9b1bb8cca5ac)...")
            connection.rollback()
            with connection.begin():
                connection.execute(sa.text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL, PRIMARY KEY (version_num))"))
                connection.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('9b1bb8cca5ac')"))
            print("Successfully stamped migration revision.")
            return

        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
