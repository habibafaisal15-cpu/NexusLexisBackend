import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from lex_ai.services import get_optimized_rag_matrix, search_question_bank_numpy, search_intro_qa

matrix, tfidf = get_optimized_rag_matrix()
print('EXCEL_ROWS', 0 if matrix is None else len(matrix))
print('TFIDF_VOCAB', 0 if tfidf is None else tfidf.vocab_size)

if matrix is not None:
    law_qs = [str(row[0]) for row in matrix if 'law' in str(row[0]).lower()][:10]
    print('SAMPLE_LAW_QUESTIONS:')
    for q in law_qs:
        print(' -', q)

if matrix is not None and tfidf is not None:
    import numpy as np
    from collections import Counter

    def best_match(query):
        qv = np.zeros(tfidf.vocab_size)
        tc = Counter(tfidf._tokenize(query))
        for term, count in tc.items():
            if term in tfidf.vocab:
                idx = tfidf.vocab[term]
                qv[idx] = count * tfidf.idf[idx]
        norm = np.linalg.norm(qv)
        if norm > 0:
            qv = qv / norm
        sims = np.dot(tfidf.doc_vectors, qv)
        best_idx = int(sims.argmax())
        return float(sims[best_idx]), str(matrix[best_idx][0]), str(matrix[best_idx][1] if len(matrix[best_idx]) > 1 else '')

    for query in ['DEFINE LAW', 'EXPLAIN LAW', 'explain law', 'what is law']:
        score, question, answer = best_match(query)
        print(f'BEST_MATCH {query!r}: score={score:.4f}')
        print(f'  Q: {question[:120]}')
        print(f'  A_LEN: {len(answer)} preview={answer[:80]!r}')
        print()

print('INTRO_QA_MATCHES:')
for query in ['DEFINE LAW', 'EXPLAIN LAW', 'What is LEX?']:
    ans, found = search_intro_qa(query)
    print(f'  {query!r} -> found={found}')
    if found:
        print(f'    EN: {ans["en"][:100]!r}')

