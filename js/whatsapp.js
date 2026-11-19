/**
 * Modulo de Automacao e Integracao WhatsApp (Fase 2 - Secoes 5, 6 e 8.1)
 * - Mensagens transacionais automaticas (Confirmacao, Lembretes 24h e 2h, Alteracao, Cancelamento)
 * - Divulgacao automatica de horarios vagos e link de agendamento
 * - Campanhas promocionais com controle estrito de consentimento LGPD (Opt-in / Opt-out)
 * - Notificacao inteligente para Lista de Espera quando surge vaga
 */

window.WhatsAppService = {
  formatDateBR(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  },

  formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  buildWaMeUrl(phone, text) {
    let clean = DB.normalizePhone(phone);
    if (clean.length === 10 || clean.length === 11) {
      clean = '55' + clean;
    }
    return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
  },

  /**
   * Renderiza um template substituindo variaveis dinamicas
   */
  renderTemplate(templateKey, context = {}) {
    const cfg = DB.getWhatsAppConfig();
    const tenant = DB.getTenant();
    const rawTemplate = (cfg.templates && cfg.templates[templateKey]) || '';

    const replacements = {
      '{cliente}': context.clientName || 'Cliente',
      '{barbearia}': tenant?.name || 'Barbearia Barreto',
      '{servico}': context.serviceName || 'Atendimento',
      '{valor}': context.servicePrice !== undefined ? this.formatCurrency(context.servicePrice) : '',
      '{data}': context.date ? this.formatDateBR(context.date) : '',
      '{horario}': context.startTime || '',
      '{codigo}': context.code || '',
      '{link}': tenant?.bookingUrl || window.location.href
    };

    let result = rawTemplate;
    Object.entries(replacements).forEach(([token, val]) => {
      result = result.split(token).join(val);
    });
    return result;
  },

  /**
   * Dispara (ou registra envio simulado/API) de mensagem transacional (Secao 5.1 e Secao 6)
   */
  sendTransactional(eventType, appointment, openWindow = false) {
    const cfg = DB.getWhatsAppConfig();
    const message = this.renderTemplate(eventType, appointment);

    let deliveryStatus = 'ENTREGUE';
    let channel = 'CLOUD_API_SIMULADA';

    if (cfg.mode === 'META_CLOUD_API' && cfg.phoneNumberId && cfg.accessToken) {
      channel = 'META_CLOUD_API';
      deliveryStatus = 'ENVIADO_API';
    } else if (cfg.mode === 'WA_LINK' || openWindow) {
      channel = 'WHATSAPP_WEB_LINK';
      deliveryStatus = 'LINK_ABERTO';
    }

    const log = DB.addMessageLog({
      recipientName: appointment.clientName,
      recipientPhone: appointment.clientPhone,
      category: 'TRANSACIONAL',
      eventType,
      message,
      deliveryStatus,
      channel
    });

    if (openWindow) {
      const url = this.buildWaMeUrl(appointment.clientPhone, message);
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    return { log, message, url: this.buildWaMeUrl(appointment.clientPhone, message) };
  },

  /**
   * Verifica agendamentos confirmados que precisam de lembrete de 24h ou 2h (Secao 6)
   */
  getPendingReminders() {
    const cfg = DB.getWhatsAppConfig();
    const confirmed = DB.getAppointments({ status: 'CONFIRMADO' });
    const now = new Date();
    const pending = [];

    confirmed.forEach(appt => {
      const [y, m, d] = appt.date.split('-').map(Number);
      const [hh, mm] = appt.startTime.split(':').map(Number);
      const apptDate = new Date(y, m - 1, d, hh, mm);
      const diffHours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      const sent = appt.remindersSent || {};

      // Janela de 24h antes (entre 3h e 28h de antecedencia se ainda nao enviado)
      if (cfg.reminder24hEnabled && diffHours > 2.5 && diffHours <= 28 && !sent.REMINDER_24H) {
        pending.push({
          type: 'REMINDER_24H',
          label: 'Lembrete 24h antes',
          diffHours: Math.round(diffHours),
          appointment: appt,
          preview: this.renderTemplate('REMINDER_24H', appt)
        });
      }

      // Janela de 2h antes (entre 0.2h e 2.5h de antecedencia se ainda nao enviado)
      if (cfg.reminder2hEnabled && diffHours > 0.15 && diffHours <= 2.5 && !sent.REMINDER_2H) {
        pending.push({
          type: 'REMINDER_2H',
          label: 'Lembrete 2h antes',
          diffHours: Number(diffHours.toFixed(1)),
          appointment: appt,
          preview: this.renderTemplate('REMINDER_2H', appt)
        });
      }
    });

    return pending;
  },

  dispatchReminder(appointmentId, reminderType, openWhatsApp = false) {
    const appt = DB.getAppointments().find(a => a.id === appointmentId);
    if (!appt) throw new Error('Agendamento não localizado para envio de lembrete.');

    const res = this.sendTransactional(reminderType, appt, openWhatsApp);
    DB.markAppointmentReminderSent(appointmentId, reminderType);
    DB.logAudit('LEMBRETE_ENVIADO', `${reminderType} enviado para ${appt.clientName} (${appt.date} ${appt.startTime}).`);
    return res;
  },

  dispatchAllPendingReminders() {
    const list = this.getPendingReminders();
    list.forEach(item => {
      this.sendTransactional(item.type, item.appointment, false);
      DB.markAppointmentReminderSent(item.appointment.id, item.type);
    });
    if (list.length > 0) {
      DB.logAudit('LEMBRETES_EM_LOTE', `${list.length} lembrete(s) automático(s) processado(s).`);
    }
    return list.length;
  },

  /**
   * Notifica cliente da Lista de Espera quando surge horario vago (Secao 8.1)
   */
  notifyWaitlistEntry(waitlistId, openWhatsApp = true) {
    const entry = DB.getWaitlist().find(w => w.id === waitlistId);
    if (!entry) throw new Error('Inscrição na lista de espera não encontrada.');

    const message = this.renderTemplate('WAITLIST_OPEN', {
      clientName: entry.clientName,
      serviceName: entry.serviceName,
      date: entry.desiredDate
    });

    DB.addMessageLog({
      recipientName: entry.clientName,
      recipientPhone: entry.clientPhone,
      category: 'LISTA_ESPERA',
      eventType: 'VAGA_DISPONIVEL',
      message,
      deliveryStatus: openWhatsApp ? 'LINK_ABERTO' : 'ENTREGUE',
      channel: openWhatsApp ? 'WHATSAPP_WEB_LINK' : 'CLOUD_API_SIMULADA'
    });

    DB.updateWaitlistStatus(waitlistId, 'NOTIFICADO');

    const url = this.buildWaMeUrl(entry.clientPhone, message);
    if (openWhatsApp) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return { message, url };
  },

  /**
   * Gera texto pronto com os horarios vagos do dia para divulgacao no Status/Lista (Secao 5.2)
   */
  generateVacantSlotsText(dateStr, serviceId) {
    const tenant = DB.getTenant();
    const service = DB.getServiceById(serviceId) || DB.getServices(true)[0];
    if (!service) return 'Nenhum serviço ativo.';

    const avail = Scheduler.getAvailableSlots(dateStr, service.id);
    if (!avail.available || avail.slots.length === 0) {
      return `Agenda lotada para ${this.formatDateBR(dateStr)}! Entre na nossa lista de espera em: ${tenant?.bookingUrl}`;
    }

    // Seleciona ate 10 horarios bem distribuidos para nao poluir a mensagem
    const sampleSlots = avail.slots.slice(0, 12).map(s => `• ${s.startTime}`).join('\n');
    const extraCount = avail.slots.length > 12 ? `\n_(+${avail.slots.length - 12} outros horários livres)_` : '';

    return `💈 *${tenant.name} — Horários Disponíveis!* ✂️\n` +
      `📅 *Data:* ${this.formatDateBR(dateStr)}\n` +
      `🔥 *Serviço referência:* ${service.name} (${service.durationMinutes} min - ${this.formatCurrency(service.price)})\n\n` +
      `⏰ *Horários livres agora:*\n${sampleSlots}${extraCount}\n\n` +
      `👉 *Garanta o seu sem fila pelo link:*\n${tenant.bookingUrl}`;
  },

  /**
   * Filtra destinatarios de campanha respeitando o consentimento LGPD (Secao 5.2 e 5.3)
   */
  getCampaignAudience(segment = 'ALL_OPTIN') {
    const allClients = DB.getClients();
    const allAppts = DB.getAppointments();
    const optInClients = allClients.filter(c => Boolean(c.marketingConsent));

    if (segment === 'ALL_OPTIN') {
      return optInClients;
    }

    const todayStr = Scheduler.getTodayDateStr();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffStr = thirtyDaysAgo.toISOString().slice(0, 10);

    if (segment === 'INACTIVE_30D') {
      // Clientes que nao possuem agendamento nos ultimos 30 dias ou futuros
      return optInClients.filter(c => {
        const clientAppts = allAppts.filter(a => a.clientId === c.id && a.status !== 'CANCELADO');
        const hasRecent = clientAppts.some(a => a.date >= cutoffStr || a.date >= todayStr);
        return !hasRecent;
      });
    }

    if (segment === 'RECURRING') {
      // Clientes com 2 ou mais agendamentos
      return optInClients.filter(c => {
        const count = allAppts.filter(a => a.clientId === c.id && a.status !== 'CANCELADO').length;
        return count >= 2;
      });
    }

    return optInClients;
  },

  /**
   * Dispara uma campanha promocional apenas para clientes com consentimento ativo (Secao 5.2 e 5.3)
   */
  dispatchCampaign({ title, segment, messageTemplate }) {
    const audience = this.getCampaignAudience(segment);
    if (audience.length === 0) {
      throw new Error('Nenhum cliente com consentimento ativo (Opt-in LGPD) encontrado para este segmento.');
    }

    const tenant = DB.getTenant();
    let sentCount = 0;

    audience.forEach(client => {
      const personalized = String(messageTemplate || '')
        .split('{cliente}').join(client.name)
        .split('{barbearia}').join(tenant.name)
        .split('{link}').join(tenant.bookingUrl) +
        `\n\n_Para não receber mais promoções, acesse "Meus Horários" no link e desative campanhas._`;

      DB.addMessageLog({
        recipientName: client.name,
        recipientPhone: client.phone,
        category: 'CAMPANHA',
        eventType: title || 'PROMOCAO',
        message: personalized,
        deliveryStatus: 'ENTREGUE',
        channel: 'CLOUD_API_CAMPANHA'
      });
      sentCount++;
    });

    DB.logAudit(
      'CAMPANHA_DISPARADA',
      `Campanha "${title}" enviada para ${sentCount} cliente(s) autorizados (Segmento: ${segment}).`
    );

    return sentCount;
  }
};
