from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE FUNCTION prevent_stock_movement_tampering()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'StockMovement ledger is strictly append-only. UPDATE and DELETE operations are prohibited.';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_protect_stock_movement_ledger ON inventory_stock_movements;
            CREATE TRIGGER trg_protect_stock_movement_ledger
            BEFORE UPDATE OR DELETE ON inventory_stock_movements
            FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_tampering();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS trg_protect_stock_movement_ledger ON inventory_stock_movements;
            DROP FUNCTION IF EXISTS prevent_stock_movement_tampering();
            """
        )
    ]

