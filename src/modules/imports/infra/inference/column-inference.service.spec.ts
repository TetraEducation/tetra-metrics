import { ColumnInferenceService } from '@/modules/imports/infra/inference/column-inference.service';

describe('ColumnInferenceService', () => {
  it('deve inferir coluna de WhatsApp como telefone mesmo sendo pergunta (contendo "qual")', () => {
    const sut = new ColumnInferenceService();

    const emailHeader = 'Com qual e-mail você se inscreveu na Imersão Excel Automate?';
    const whatsappHeader =
      'Qual seu número de WhatsApp? (Podemos enviar lembretes da aula para os alunos e responder suas dúvidas durante o curso)';

    const headers = [emailHeader, whatsappHeader];
    const rows: Array<Record<string, unknown>> = [
      {
        [emailHeader]: 'mariaeduardasantossil375@gmail.com',
        [whatsappHeader]: '11982501508',
      },
      {
        [emailHeader]: 'lucasksabino@gmail.com',
        [whatsappHeader]: '(81) 99827-0258',
      },
    ];

    const inferred = sut.infer(headers, rows);

    expect(inferred.phoneKey).toBe(whatsappHeader);
  });

  it('detecta sobrenome quando existe Nome + Sobrenome', () => {
    const sut = new ColumnInferenceService();

    const emailHeader = 'E-mail';
    const nameHeader = 'Nome';
    const surnameHeader = 'Sobrenome';

    const headers = [emailHeader, nameHeader, surnameHeader];
    const rows = [
      {
        [emailHeader]: 'maria@example.com',
        [nameHeader]: 'Maria',
        [surnameHeader]: 'Silva',
      },
    ];

    const inferred = sut.infer(headers, rows);

    expect(inferred.nameKey).toBe(nameHeader);
    expect(inferred.surnameKey).toBe(surnameHeader);
    expect(inferred.fullNameKey).toBeNull();
  });
});

