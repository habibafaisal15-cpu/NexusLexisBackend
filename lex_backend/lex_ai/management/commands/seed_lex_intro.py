from django.core.management.base import BaseCommand

from lex_ai.intro_qa import LEX_INTRO_QA
from lex_ai.models import KnowledgeBaseEntry


class Command(BaseCommand):
    help = "Seed LEX introductory Q&A entries into the knowledge base"

    def handle(self, *args, **options):
        created = 0
        updated = 0

        for entry in LEX_INTRO_QA:
            question_en = entry["questions"][0]
            obj, was_created = KnowledgeBaseEntry.objects.update_or_create(
                category=entry["category"],
                question_en=question_en,
                defaults={
                    "answer_en": entry["answer_en"],
                    "question_ur": entry["questions"][0],
                    "answer_ur": entry["answer_ur"],
                    "is_verified": True,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"LEX intro Q&A seeded: {created} created, {updated} updated."
            )
        )
