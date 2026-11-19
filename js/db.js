/**
 * Camada de Dados Multi-Tenant (Pronta para evolucao SaaS / PostgreSQL)
 * Isola todos os dados por barbershopId conforme Secao 12 do escopo.
 * Inclui Fase 1 (MVP) + Fase 2 (Automacao WhatsApp, Campanhas, Consentimento LGPD e Lista de Espera).
 */

const STORAGE_KEY = 'barbearia_saas_db_v1';
const DEFAULT_TENANT_ID = 'barbearia-barreto';

const DEFAULT_WHATSAPP_CONFIG = {
  tenantId: DEFAULT_TENANT_ID,
  mode: 'SIMULATED_CLOUD_API', // 'WA_LINK' | 'SIMULATED_CLOUD_API' | 'META_CLOUD_API'
  phoneNumberId: '',
  accessToken: '',
  autoSendTransactional: true,
  reminder24hEnabled: true,
  reminder2hEnabled: true,
  templates: {
    CONFIRMATION: 'Olá, *{cliente}*! ✅ Seu agendamento na *{barbearia}* está confirmado:\n• *Código:* {codigo}\n• *Serviço:* {servico} ({valor})\n• *Data:* {data} às *{horario}*\nPrecisando alterar ou cancelar, acesse: {link}',
    REMINDER_24H: 'Olá, *{cliente}*! ⏰ Lembrete de atendimento amanhã na *{barbearia}*:\n• *Serviço:* {servico}\n• *Data:* {data} às *{horario}*\nConfirmado? Responda SIM ou acesse {link} caso precise remarcar.',
    REMINDER_2H: 'Falta pouco, *{cliente}*! 💈 Seu horário na *{barbearia}* para *{servico}* é hoje às *{horario}*. Estamos te esperando!',
    RESCHEDULE: 'Olá, *{cliente}*! 🔄 Seu agendamento ({codigo}) na *{barbearia}* foi remarcado para *{data}* às *{horario}* ({servico}).',
    CANCELLATION: 'Olá, *{cliente}*. ❌ Seu agendamento ({codigo}) para *{servico}* em {data} às {horario} na *{barbearia}* foi cancelado. Quando quiser reagendar, acesse: {link}',
    WAITLIST_OPEN: 'Boa notícia, *{cliente}*! 🎉 Surgiu um horário vago na *{barbearia}* para *{servico}* no dia *{data}*! Acesse agora para garantir sua vaga: {link}'
  }
};

const INITIAL_SEED = {
  tenants: [
    {
      id: DEFAULT_TENANT_ID,
      name: 'Barbearia Barreto',
      slug: 'barbearia-barreto',
      phone: '5534988034880',
      address: 'Rua Antônio Ribeiro de Carvalho, 150 - Max Neuman 2',
      bookingUrl: typeof window !== 'undefined' && window.location.protocol.startsWith('http')
        ? window.location.origin
        : 'https://barbearia-barreto.netlify.app',
      adminPin: '1234',
      slotIntervalMinutes: 15,
      minAdvanceMinutes: 30,
      maxAdvanceDays: 30,
      createdAt: new Date().toISOString()
    }
  ],

  businessHours: [
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 0, dayName: 'Domingo', isOpen: false, openTime: '09:00', closeTime: '18:00', breakStart: '', breakEnd: '' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 1, dayName: 'Segunda-feira', isOpen: false, openTime: '09:00', closeTime: '19:00', breakStart: '', breakEnd: '' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 2, dayName: 'Terça-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 3, dayName: 'Quarta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 4, dayName: 'Quinta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 5, dayName: 'Sexta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
    { tenantId: DEFAULT_TENANT_ID, dayOfWeek: 6, dayName: 'Sábado', isOpen: true, openTime: '08:00', closeTime: '18:00', breakStart: '12:30', breakEnd: '13:30' }
  ],

  services: [
    {
      id: 'srv-1',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Corte de cabelo',
      description: 'Corte social, degradê ou navalhado com acabamento completo.',
      durationMinutes: 30,
      price: 35.00,
      active: true
    },
    {
      id: 'srv-2',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Barba',
      description: 'Modelagem, alinhamento com navalha e toalha quente.',
      durationMinutes: 20,
      price: 25.00,
      active: true
    },
    {
      id: 'srv-3',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Cabelo + barba',
      description: 'Combo completo de corte de cabelo e barba alinhada.',
      durationMinutes: 50,
      price: 55.00,
      active: true
    },
    {
      id: 'srv-4',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Sobrancelha',
      description: 'Limpeza e alinhamento na navalha ou pinça.',
      durationMinutes: 15,
      price: 15.00,
      active: true
    }
  ],

  clients: [],
  appointments: [],
  blockedSlots: [],
  waitlist: [], // Fase 2 (Secao 8.1): Lista de espera
  whatsappConfigs: [DEFAULT_WHATSAPP_CONFIG], // Fase 2 (Secao 5 e 6)
  messageLogs: [], // Fase 2 (Secao 5.3): Registro de envios e status de entrega
  campaigns: [], // Fase 2 (Secao 5.2): Campanhas disparadas
  auditLogs: []
};

window.DB = {
  tenantId: DEFAULT_TENANT_ID,

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED));
      return JSON.parse(JSON.stringify(INITIAL_SEED));
    }
    try {
      const parsed = JSON.parse(raw);
      // Migracao suave para garantir estruturas da Fase 2 em bancos ja existentes
      if (!parsed.waitlist) parsed.waitlist = [];
      if (!parsed.whatsappConfigs) parsed.whatsappConfigs = [JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_CONFIG))];
      if (!parsed.messageLogs) parsed.messageLogs = [];
      if (!parsed.campaigns) parsed.campaigns = [];
      if (parsed.tenants && parsed.tenants[0]) {
        parsed.tenants[0].phone = '5534988034880';
        parsed.tenants[0].address = 'Rua Antônio Ribeiro de Carvalho, 150 - Max Neuman 2';
        parsed.tenants[0].bookingUrl = (typeof window !== 'undefined' && window.location.protocol.startsWith('http'))
          ? window.location.origin
          : 'https://barbearia-barreto.netlify.app';
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    } catch (e) {
      console.error('Erro ao ler banco local, recriando seed:', e);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED));
      return JSON.parse(JSON.stringify(INITIAL_SEED));
    }
  },

  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  resetToSeed() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED));
    return this.init();
  },

  getTenant() {
    const data = this.init();
    return data.tenants.find(t => t.id === this.tenantId);
  },

  updateTenant(updates) {
    const data = this.init();
    const idx = data.tenants.findIndex(t => t.id === this.tenantId);
    if (idx !== -1) {
      data.tenants[idx] = { ...data.tenants[idx], ...updates };
      this.save(data);
      this.logAudit('CONFIG_BARBEARIA', 'Configurações gerais da barbearia atualizadas.');
    }
    return data.tenants[idx];
  },

  // --- SERVICOS ---
  getServices(onlyActive = false) {
    const data = this.init();
    return data.services.filter(s => s.tenantId === this.tenantId && (!onlyActive || s.active));
  },

  getServiceById(serviceId) {
    return this.getServices(false).find(s => s.id === serviceId);
  },

  saveService(serviceData) {
    const data = this.init();
    if (serviceData.id) {
      const idx = data.services.findIndex(s => s.id === serviceData.id && s.tenantId === this.tenantId);
      if (idx !== -1) {
        data.services[idx] = {
          ...data.services[idx],
          name: serviceData.name.trim(),
          description: (serviceData.description || '').trim(),
          durationMinutes: Number(serviceData.durationMinutes),
          price: Number(serviceData.price),
          active: Boolean(serviceData.active)
        };
        this.save(data);
        this.logAudit('SERVICO_EDITADO', `Serviço "${serviceData.name}" atualizado.`);
        return data.services[idx];
      }
    }
    const newService = {
      id: 'srv-' + Date.now(),
      tenantId: this.tenantId,
      name: serviceData.name.trim(),
      description: (serviceData.description || '').trim(),
      durationMinutes: Number(serviceData.durationMinutes),
      price: Number(serviceData.price),
      active: true
    };
    data.services.push(newService);
    this.save(data);
    this.logAudit('SERVICO_CRIADO', `Novo serviço "${newService.name}" (${newService.durationMinutes} min - R$ ${newService.price.toFixed(2)}).`);
    return newService;
  },

  toggleServiceActive(serviceId) {
    const data = this.init();
    const srv = data.services.find(s => s.id === serviceId && s.tenantId === this.tenantId);
    if (srv) {
      srv.active = !srv.active;
      this.save(data);
      this.logAudit('SERVICO_STATUS', `Serviço "${srv.name}" marcado como ${srv.active ? 'Ativo' : 'Inativo'}.`);
    }
    return srv;
  },

  // --- HORARIOS DE FUNCIONAMENTO ---
  getBusinessHours() {
    const data = this.init();
    return data.businessHours
      .filter(bh => bh.tenantId === this.tenantId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  },

  saveBusinessHours(hoursArray) {
    const data = this.init();
    data.businessHours = data.businessHours.filter(bh => bh.tenantId !== this.tenantId);
    hoursArray.forEach(item => {
      data.businessHours.push({
        tenantId: this.tenantId,
        dayOfWeek: Number(item.dayOfWeek),
        dayName: item.dayName,
        isOpen: Boolean(item.isOpen),
        openTime: item.openTime || '09:00',
        closeTime: item.closeTime || '19:00',
        breakStart: item.breakStart || '',
        breakEnd: item.breakEnd || ''
      });
    });
    this.save(data);
    this.logAudit('EXPEDIENTE_ATUALIZADO', 'Horários de funcionamento atualizados pelo administrador.');
  },

  // --- BLOQUEIOS E EXCECOES ---
  getBlockedSlots(dateStr = null) {
    const data = this.init();
    return data.blockedSlots.filter(b =>
      b.tenantId === this.tenantId && (!dateStr || b.date === dateStr)
    );
  },

  addBlockedSlot({ date, startTime, endTime, reason, isFullDay }) {
    const data = this.init();
    const block = {
      id: 'blk-' + Date.now(),
      tenantId: this.tenantId,
      date,
      isFullDay: Boolean(isFullDay),
      startTime: isFullDay ? '00:00' : startTime,
      endTime: isFullDay ? '23:59' : endTime,
      reason: (reason || 'Bloqueio manual').trim(),
      createdAt: new Date().toISOString()
    };
    data.blockedSlots.push(block);
    this.save(data);
    this.logAudit('BLOQUEIO_CRIADO', `Bloqueio em ${date} (${block.startTime} às ${block.endTime}): ${block.reason}`);
    return block;
  },

  removeBlockedSlot(blockId) {
    const data = this.init();
    const target = data.blockedSlots.find(b => b.id === blockId && b.tenantId === this.tenantId);
    data.blockedSlots = data.blockedSlots.filter(b => !(b.id === blockId && b.tenantId === this.tenantId));
    this.save(data);
    if (target) {
      this.logAudit('BLOQUEIO_REMOVIDO', `Bloqueio removido de ${target.date} (${target.reason}).`);
    }
  },

  // --- CLIENTES & CONSENTIMENTO LGPD (Secao 5.3) ---
  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  },

  getClients() {
    const data = this.init();
    return data.clients.filter(c => c.tenantId === this.tenantId);
  },

  upsertClient({ name, phone, email, marketingConsent, source = 'AGENDAMENTO' }) {
    const data = this.init();
    const cleanPhone = this.normalizePhone(phone);
    if (cleanPhone.length < 10) {
      throw new Error('Telefone inválido para cadastro de cliente.');
    }

    let client = data.clients.find(c => c.tenantId === this.tenantId && c.phone === cleanPhone);

    if (client) {
      if (name && name.trim()) client.name = name.trim();
      if (email && email.trim()) client.email = email.trim();
      if (typeof marketingConsent === 'boolean') {
        client.marketingConsent = marketingConsent;
        client.consentUpdatedAt = new Date().toISOString();
      }
      client.updatedAt = new Date().toISOString();
    } else {
      client = {
        id: 'cli-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        tenantId: this.tenantId,
        name: (name || 'Cliente').trim(),
        phone: cleanPhone,
        email: (email || '').trim(),
        marketingConsent: Boolean(marketingConsent),
        consentUpdatedAt: new Date().toISOString(),
        source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.clients.push(client);
    }
    this.save(data);
    return client;
  },

  setClientMarketingConsent(phoneOrId, consentBool, origin = 'CLIENTE') {
    const data = this.init();
    const cleanPhone = this.normalizePhone(phoneOrId);
    const client = data.clients.find(
      c => c.tenantId === this.tenantId && (c.id === phoneOrId || c.phone === cleanPhone)
    );
    if (!client) {
      throw new Error('Contato não encontrado na base da barbearia.');
    }
    client.marketingConsent = Boolean(consentBool);
    client.consentUpdatedAt = new Date().toISOString();
    this.save(data);
    this.logAudit(
      'LGPD_CONSENTIMENTO',
      `Cliente ${client.name} (${client.phone}) ${client.marketingConsent ? 'AUTORIZOU' : 'REVOGOU (Opt-out)'} campanhas via ${origin}.`
    );
    return client;
  },

  importClientsFromCSV(csvText, defaultConsent = true) {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    let importedCount = 0;
    lines.forEach((line, index) => {
      // Ignora cabecalho se tiver palavra "nome" e "telefone"
      if (index === 0 && /nome/i.test(line) && /(telefone|celular|whatsapp|fone)/i.test(line)) {
        return;
      }
      const parts = line.split(/[;,]/).map(p => p.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const phone = this.normalizePhone(parts[1]);
        const email = parts[2] || '';
        const consentRaw = parts[3] ? parts[3].toLowerCase() : '';
        const consent = consentRaw
          ? ['sim', 'true', '1', 's', 'yes'].includes(consentRaw)
          : Boolean(defaultConsent);

        if (name && phone.length >= 10) {
          this.upsertClient({ name, phone, email, marketingConsent: consent, source: 'CSV_IMPORT' });
          importedCount++;
        }
      }
    });

    if (importedCount > 0) {
      this.logAudit('IMPORTACAO_CSV', `${importedCount} contato(s) importado(s) via CSV.`);
    }
    return importedCount;
  },

  // --- AGENDAMENTOS ---
  getAppointments(filters = {}) {
    const data = this.init();
    let list = data.appointments.filter(a => a.tenantId === this.tenantId);

    if (filters.date) {
      list = list.filter(a => a.date === filters.date);
    }
    if (filters.phone) {
      const clean = this.normalizePhone(filters.phone);
      list = list.filter(a => this.normalizePhone(a.clientPhone) === clean);
    }
    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(a => a.status === filters.status);
    }

    return list.sort((a, b) => {
      const cmpDate = a.date.localeCompare(b.date);
      return cmpDate !== 0 ? cmpDate : a.startTime.localeCompare(b.startTime);
    });
  },

  markAppointmentReminderSent(appointmentId, reminderKey) {
    const data = this.init();
    const appt = data.appointments.find(a => a.id === appointmentId && a.tenantId === this.tenantId);
    if (appt) {
      if (!appt.remindersSent) appt.remindersSent = {};
      appt.remindersSent[reminderKey] = new Date().toISOString();
      this.save(data);
    }
    return appt;
  },

  // --- FASE 2: LISTA DE ESPERA (Secao 8.1) ---
  getWaitlist(filters = {}) {
    const data = this.init();
    let list = data.waitlist.filter(w => w.tenantId === this.tenantId);
    if (filters.date) {
      list = list.filter(w => w.desiredDate === filters.date);
    }
    if (filters.phone) {
      const clean = this.normalizePhone(filters.phone);
      list = list.filter(w => this.normalizePhone(w.clientPhone) === clean);
    }
    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(w => w.status === filters.status);
    }
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  addToWaitlist({ clientName, clientPhone, serviceId, desiredDate, preferredPeriod, notes }) {
    const service = this.getServiceById(serviceId);
    if (!service) throw new Error('Selecione um serviço válido para a lista de espera.');
    const cleanPhone = this.normalizePhone(clientPhone);
    if (!clientName || clientName.trim().length < 2) throw new Error('Informe seu nome completo.');
    if (cleanPhone.length < 10) throw new Error('Informe um WhatsApp válido com DDD.');
    if (!desiredDate) throw new Error('Selecione a data desejada.');

    this.upsertClient({
      name: clientName,
      phone: cleanPhone,
      marketingConsent: true,
      source: 'LISTA_ESPERA'
    });

    const data = this.init();
    const entry = {
      id: 'wl-' + Date.now(),
      tenantId: this.tenantId,
      clientName: clientName.trim(),
      clientPhone: cleanPhone,
      serviceId: service.id,
      serviceName: service.name,
      serviceDuration: service.durationMinutes,
      servicePrice: service.price,
      desiredDate,
      preferredPeriod: preferredPeriod || 'QUALQUER', // 'MANHA' | 'TARDE' | 'NOITE' | 'QUALQUER'
      notes: (notes || '').trim(),
      status: 'AGUARDANDO', // 'AGUARDANDO' | 'NOTIFICADO' | 'ATENDIDO' | 'CANCELADO'
      notifiedAt: null,
      createdAt: new Date().toISOString()
    };

    data.waitlist.push(entry);
    this.save(data);
    this.logAudit(
      'LISTA_ESPERA_INCLUSAO',
      `${entry.clientName} entrou na lista de espera para ${entry.serviceName} em ${desiredDate} (${entry.preferredPeriod}).`
    );
    return entry;
  },

  updateWaitlistStatus(waitlistId, newStatus) {
    const data = this.init();
    const item = data.waitlist.find(w => w.id === waitlistId && w.tenantId === this.tenantId);
    if (!item) throw new Error('Registro da lista de espera não encontrado.');
    item.status = newStatus;
    if (newStatus === 'NOTIFICADO') {
      item.notifiedAt = new Date().toISOString();
    }
    this.save(data);
    this.logAudit('LISTA_ESPERA_STATUS', `Lista de espera (${item.clientName} - ${item.desiredDate}) marcada como ${newStatus}.`);
    return item;
  },

  // --- FASE 2: CONFIGURACAO E LOGS DO WHATSAPP (Secao 5 e 6) ---
  getWhatsAppConfig() {
    const data = this.init();
    let cfg = data.whatsappConfigs.find(c => c.tenantId === this.tenantId);
    if (!cfg) {
      cfg = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_CONFIG));
      data.whatsappConfigs.push(cfg);
      this.save(data);
    }
    return cfg;
  },

  saveWhatsAppConfig(updates) {
    const data = this.init();
    const idx = data.whatsappConfigs.findIndex(c => c.tenantId === this.tenantId);
    if (idx !== -1) {
      data.whatsappConfigs[idx] = {
        ...data.whatsappConfigs[idx],
        ...updates,
        templates: {
          ...data.whatsappConfigs[idx].templates,
          ...(updates.templates || {})
        }
      };
    } else {
      data.whatsappConfigs.push({
        ...DEFAULT_WHATSAPP_CONFIG,
        ...updates,
        tenantId: this.tenantId
      });
    }
    this.save(data);
    this.logAudit('WHATSAPP_CONFIG', 'Configurações e modelos de mensagens do WhatsApp atualizados.');
    return this.getWhatsAppConfig();
  },

  addMessageLog({ recipientName, recipientPhone, category, eventType, message, deliveryStatus, channel }) {
    const data = this.init();
    const entry = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      tenantId: this.tenantId,
      recipientName: recipientName || 'Cliente',
      recipientPhone: this.normalizePhone(recipientPhone),
      category: category || 'TRANSACIONAL', // 'TRANSACIONAL' | 'CAMPANHA' | 'LISTA_ESPERA'
      eventType: eventType || 'CONFIRMACAO',
      message,
      deliveryStatus: deliveryStatus || 'ENTREGUE', // 'ENTREGUE' | 'ENVIADO_API' | 'LINK_GERADO' | 'BLOQUEADO_LGPD'
      channel: channel || 'CLOUD_API',
      timestamp: new Date().toISOString()
    };
    data.messageLogs.unshift(entry);
    data.messageLogs = data.messageLogs.slice(0, 200);
    this.save(data);
    return entry;
  },

  getMessageLogs() {
    const data = this.init();
    return data.messageLogs.filter(m => m.tenantId === this.tenantId);
  },

  logAudit(action, details) {
    const data = this.init();
    data.auditLogs.unshift({
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      tenantId: this.tenantId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    data.auditLogs = data.auditLogs.slice(0, 120);
    this.save(data);
  },

  getAuditLogs() {
    const data = this.init();
    return data.auditLogs.filter(l => l.tenantId === this.tenantId);
  }
};
