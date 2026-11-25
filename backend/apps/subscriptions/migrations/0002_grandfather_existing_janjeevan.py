from django.db import migrations


JANJEEVAN_PARTNER_IDS = [
    "34fa8868-0a34-4fe3-8d96-ea59fd178e88",
    "1332abd4-e807-4fd9-8a24-e11f4497c098",
]


def grandfather_existing_organizations(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Partner = apps.get_model("partners", "Partner")
    OrganizationSubscription = apps.get_model(
        "subscriptions", "OrganizationSubscription"
    )

    database = schema_editor.connection.alias

    partner_ids = list(JANJEEVAN_PARTNER_IDS)
    for p in Partner.objects.using(database).filter(slug="sushrusha-eclinic"):
        if str(p.id) not in partner_ids:
            partner_ids.append(str(p.id))

    organizations = Organization.objects.using(database).filter(
        partner_id__in=partner_ids
    )

    for organization in organizations.iterator():
        OrganizationSubscription.objects.using(database).get_or_create(
            organization_id=organization.pk,
            defaults={
                "partner_id": organization.partner_id,
                "status": "grandfathered",
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0005_organization_address_organization_city_and_more"),
        ("subscriptions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            grandfather_existing_organizations,
            migrations.RunPython.noop,
        ),
    ]
