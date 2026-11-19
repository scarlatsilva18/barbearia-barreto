/**
 * Controlador de Interface (Fase 1 MVP + Fase 2 Automacao WhatsApp, Campanhas e Lista de Espera)
 */

window.App = {
  state: {
    currentView: 'CLIENT', // 'CLIENT' | 'CLIENT_MY_APPTS' | 'ADMIN'
    adminAuthenticated: false,
    adminTab: 'AGENDA', // 'AGENDA' | 'WAITLIST' | 'WHATSAPP' | 'BLOCKS' | 'SERVICES' | 'HOURS' | 'CLIENTS' | 'AUDIT'
    selectedServiceId: null,
    selectedDate: '',
    selectedSlot: null,
    showClientWaitlistForm: false,
    lastConfirmedAppt: null,
    adminSelectedDate: '',
    adminFilterStatus: 'ALL',
    reschedulingApptId: null,
    campaignSegment: 'ALL_OPTIN',
    campaignTitle: 'Promoção da Semana',
    campaignTemplate: 'Fala, *{cliente}*! 💈 Semana especial na *{barbearia}* com horários abertos e condições especiais. Garanta seu horário pelo link: {link}',
    vacantDate: '',
    vacantServiceId: ''
  },

  init() {
    DB.init();
    const today = this.getNextOpenDateStr();
    this.state.selectedDate = today;
    this.state.adminSelectedDate = Scheduler.getTodayDateStr();
    this.state.vacantDate = today;

    const activeServices = DB.getServices(true);
    if (activeServices.length > 0) {
      this.state.selectedServiceId = activeServices[0].id;
      this.state.vacantServiceId = activeServices[0].id;
    }

    this.renderHeader();
    this.render();
  },

  getNextOpenDateStr() {
    const hours = DB.getBusinessHours();
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const bh = hours.find(h => h.dayOfWeek === candidate.getDay());
      if (bh && bh.isOpen) {
        const y = candidate.getFullYear();
        const m = String(candidate.getMonth() + 1).padStart(2, '0');
        const d = String(candidate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    return Scheduler.getTodayDateStr();
  },

  formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDateBR(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  },

  formatPhoneBR(phone) {
    const p = DB.normalizePhone(phone);
    if (p.length === 11) {
      return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
    }
    if (p.length === 10) {
      return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
    }
    return phone;
  },

  buildWhatsAppUrl(phone, message) {
    return WhatsAppService.buildWaMeUrl(phone, message);
  },

  notify(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bg = type === 'error'
      ? 'bg-red-600 border-red-400'
      : type === 'info'
        ? 'bg-amber-600 border-amber-400'
        : 'bg-emerald-600 border-emerald-400';

    toast.className = `${bg} text-white px-4 py-3 rounded-xl shadow-xl border text-sm font-medium flex items-center justify-between gap-3 transition-all duration-300`;
    toast.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white font-bold">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 5000);
  },

  switchView(viewName) {
    this.state.currentView = viewName;
    this.state.lastConfirmedAppt = null;
    this.renderHeader();
    this.render();
  },

  renderHeader() {
    const tenant = DB.getTenant();
    const titleEl = document.getElementById('brand-name');
    const subtitleEl = document.getElementById('brand-address');
    if (titleEl && tenant) titleEl.textContent = tenant.name;
    if (subtitleEl && tenant) subtitleEl.textContent = tenant.address;

    document.querySelectorAll('[data-nav-btn]').forEach(btn => {
      const target = btn.getAttribute('data-nav-btn');
      if (target === this.state.currentView) {
        btn.className = 'px-3.5 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-zinc-950 shadow-sm transition';
      } else {
        btn.className = 'px-3.5 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition';
      }
    });
  },

  render() {
    const root = document.getElementById('app-root');
    if (!root) return;

    if (this.state.currentView === 'CLIENT') {
      root.innerHTML = this.renderClientBookingView();
    } else if (this.state.currentView === 'CLIENT_MY_APPTS') {
      root.innerHTML = this.renderClientMyAppointmentsView();
    } else if (this.state.currentView === 'ADMIN') {
      root.innerHTML = this.state.adminAuthenticated
        ? this.renderAdminDashboardView()
        : this.renderAdminLoginView();
    }
  },

  // ============================================================================
  // 1. VISAO DO CLIENTE - NOVO AGENDAMENTO + LISTA DE ESPERA (FASE 2)
  // ============================================================================
  renderClientBookingView() {
    if (this.state.lastConfirmedAppt) {
      return this.renderConfirmationScreen(this.state.lastConfirmedAppt);
    }

    const services = DB.getServices(true);
    if (!this.state.selectedServiceId && services.length > 0) {
      this.state.selectedServiceId = services[0].id;
    }

    const selectedService = DB.getServiceById(this.state.selectedServiceId);
    const availability = selectedService && this.state.selectedDate
      ? Scheduler.getAvailableSlots(this.state.selectedDate, selectedService.id)
      : { available: false, reason: 'Selecione um serviço e uma data.', slots: [] };

    const serviceCardsHtml = services.map(srv => {
      const isSelected = srv.id === this.state.selectedServiceId;
      return `
        <button
          type="button"
          onclick="App.selectService('${srv.id}')"
          class="text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
            isSelected
              ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500'
              : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
          }"
        >
          <div>
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-bold text-white text-base">${srv.name}</h3>
              <span class="text-amber-400 font-bold text-base whitespace-nowrap">${this.formatCurrency(srv.price)}</span>
            </div>
            <p class="text-xs text-zinc-400 mt-1 line-clamp-2">${srv.description || ''}</p>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 font-medium">
              ⏱ ${srv.durationMinutes} min
            </span>
            <span class="${isSelected ? 'text-amber-400 font-semibold' : 'text-zinc-500'}">
              ${isSelected ? '✓ Selecionado' : 'Selecionar'}
            </span>
          </div>
        </button>
      `;
    }).join('');

    const slotsHtml = availability.available
      ? `
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 mt-3">
          ${availability.slots.map(slot => {
            const isSelected = this.state.selectedSlot === slot.startTime;
            return `
              <button
                type="button"
                onclick="App.selectSlot('${slot.startTime}')"
                class="py-2.5 px-3 rounded-lg font-semibold text-sm border transition ${
                  isSelected
                    ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md'
                    : 'bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-amber-500/50 hover:text-amber-300'
                }"
              >
                ${slot.startTime}
              </button>
            `;
          }).join('')}
        </div>
      `
      : `
        <div class="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 text-amber-400 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span>⚠️</span>
            <span>${availability.reason}</span>
          </div>
          <button
            type="button"
            onclick="App.state.showClientWaitlistForm = true; App.render();"
            class="px-3.5 py-2 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs shrink-0"
          >
            ⏳ Entrar na Lista de Espera
          </button>
        </div>
      `;

    const waitlistSectionHtml = `
      <div class="mt-4 pt-4 border-t border-zinc-800/80">
        <div class="flex items-center justify-between">
          <span class="text-xs text-zinc-400">Não encontrou o horário ideal nesta data?</span>
          <button
            type="button"
            onclick="App.state.showClientWaitlistForm = !App.state.showClientWaitlistForm; App.render();"
            class="text-xs font-semibold text-amber-400 hover:text-amber-300 underline"
          >
            ${this.state.showClientWaitlistForm ? 'Ocultar Lista de Espera' : '⏳ Entrar na Lista de Espera (Avisamos no WhatsApp)'}
          </button>
        </div>

        ${this.state.showClientWaitlistForm ? `
          <form onsubmit="App.submitClientWaitlist(event)" class="mt-3 p-4 rounded-xl bg-zinc-950 border border-amber-500/40 space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-bold text-amber-400">⏳ Lista de Espera Inteligente (${this.formatDateBR(this.state.selectedDate)})</h4>
              <span class="text-[11px] text-zinc-400">Serviço: ${selectedService ? selectedService.name : ''}</span>
            </div>
            <p class="text-xs text-zinc-400">Se surgir uma vaga ou desistência nesta data, você receberá uma notificação prioritária no seu WhatsApp.</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Seu Nome *</label>
                <input
                  type="text"
                  id="wl-client-name"
                  required
                  placeholder="Ex: Rafael Souza"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Seu WhatsApp com DDD *</label>
                <input
                  type="tel"
                  id="wl-client-phone"
                  required
                  placeholder="(11) 99999-8888"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Turno de Preferência</label>
                <select id="wl-period" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white">
                  <option value="QUALQUER">Qualquer horário</option>
                  <option value="MANHA">Manhã (até 12h)</option>
                  <option value="TARDE">Tarde (12h às 17h)</option>
                  <option value="NOITE">Fim de tarde / Noite (após 17h)</option>
                </select>
              </div>
            </div>
            <div class="flex justify-end">
              <button
                type="submit"
                class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition"
              >
                Me Avisar no WhatsApp se Abrir Vaga
              </button>
            </div>
          </form>
        ` : ''}
      </div>
    `;

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Banner Informativo -->
        <div class="bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/30 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span class="text-xs uppercase tracking-wider text-amber-400 font-bold">Agendamento Online + Automação WhatsApp</span>
            <h1 class="text-xl sm:text-2xl font-bold text-white mt-0.5">Reserve seu horário sem fila</h1>
            <p class="text-sm text-zinc-400 mt-1">Confirmação imediata, lembretes automáticos pelo WhatsApp e lista de espera inteligente.</p>
          </div>
          <div class="text-xs text-zinc-400 bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 shrink-0">
            <div class="font-semibold text-zinc-200 mb-1">Horário Padrão:</div>
            <div>Ter a Sex: 09:00 às 19:00</div>
            <div>Sábado: 08:00 às 18:00</div>
            <div class="text-zinc-500">Dom e Seg: Fechado</div>
          </div>
        </div>

        <!-- Passo 1: Escolha do Servico -->
        <section class="bg-zinc-900/50 border border-zinc-800/90 rounded-2xl p-5">
          <div class="flex items-center gap-2.5 mb-4">
            <span class="w-7 h-7 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center">1</span>
            <h2 class="text-lg font-bold text-white">Escolha o serviço</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            ${serviceCardsHtml}
          </div>
        </section>

        <!-- Passo 2: Data e Horario -->
        <section class="bg-zinc-900/50 border border-zinc-800/90 rounded-2xl p-5">
          <div class="flex items-center gap-2.5 mb-4">
            <span class="w-7 h-7 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center">2</span>
            <h2 class="text-lg font-bold text-white">Data e horário disponível</h2>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center gap-4">
            <div class="w-full sm:w-64">
              <label class="block text-xs text-zinc-400 mb-1 font-medium">Selecione a data</label>
              <input
                type="date"
                value="${this.state.selectedDate}"
                min="${Scheduler.getTodayDateStr()}"
                onchange="App.selectDate(this.value)"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            ${selectedService ? `
              <div class="text-xs text-zinc-400 sm:pt-4">
                Calculando janelas livres para <strong class="text-zinc-200">${selectedService.name}</strong>
                (<strong class="text-amber-400">${selectedService.durationMinutes} minutos</strong> de duração).
              </div>
            ` : ''}
          </div>

          <div class="mt-4">
            <label class="block text-xs text-zinc-400 font-medium">Horários livres em ${this.formatDateBR(this.state.selectedDate)}:</label>
            ${slotsHtml}
          </div>

          ${waitlistSectionHtml}
        </section>

        <!-- Passo 3: Identificacao do Cliente -->
        <section class="bg-zinc-900/50 border border-zinc-800/90 rounded-2xl p-5">
          <div class="flex items-center gap-2.5 mb-4">
            <span class="w-7 h-7 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center">3</span>
            <h2 class="text-lg font-bold text-white">Seus dados para confirmação</h2>
          </div>

          <form onsubmit="App.submitClientBooking(event)" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-zinc-300 mb-1 font-medium">Seu nome completo *</label>
                <input
                  type="text"
                  id="client-name"
                  required
                  placeholder="Ex: João Silva"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1 font-medium">Celular / WhatsApp (com DDD) *</label>
                <input
                  type="tel"
                  id="client-phone"
                  required
                  placeholder="Ex: (11) 99999-8888"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-zinc-400 mb-1 font-medium">E-mail (opcional)</label>
                <input
                  type="email"
                  id="client-email"
                  placeholder="seuemail@exemplo.com"
                  class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1 font-medium">Observação (opcional)</label>
                <input
                  type="text"
                  id="client-notes"
                  placeholder="Ex: Degradê navalhado..."
                  class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <label class="flex items-start gap-2.5 text-xs text-zinc-400 cursor-pointer select-none pt-1">
              <input type="checkbox" id="client-consent" checked class="mt-0.5 accent-amber-500 rounded" />
              <span>Autorizo o recebimento de confirmações, lembretes automáticos e campanhas promocionais pelo WhatsApp (você pode cancelar campanhas a qualquer momento em "Meus Horários" - Seção 5.3 LGPD).</span>
            </label>

            <!-- Resumo antes de confirmar -->
            <div class="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="text-sm">
                <div class="text-zinc-400 text-xs">Resumo da reserva:</div>
                <div class="font-bold text-white mt-0.5">
                  ${selectedService ? `${selectedService.name} (${this.formatCurrency(selectedService.price)})` : 'Selecione um serviço'}
                </div>
                <div class="text-xs text-amber-400 mt-0.5">
                  ${this.state.selectedDate ? `Data: ${this.formatDateBR(this.state.selectedDate)}` : ''}
                  ${this.state.selectedSlot ? ` • Horário: ${this.state.selectedSlot}` : ' • Escolha um horário acima'}
                </div>
              </div>

              <button
                type="submit"
                ${!this.state.selectedSlot ? 'disabled' : ''}
                class="px-6 py-3 rounded-xl font-bold text-sm transition shadow-lg ${
                  this.state.selectedSlot
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }"
              >
                Confirmar Agendamento
              </button>
            </div>
          </form>
        </section>
      </div>
    `;
  },

  selectService(serviceId) {
    this.state.selectedServiceId = serviceId;
    this.state.selectedSlot = null;
    this.render();
  },

  selectDate(dateStr) {
    this.state.selectedDate = dateStr;
    this.state.selectedSlot = null;
    this.render();
  },

  selectSlot(startTime) {
    this.state.selectedSlot = startTime;
    this.render();
  },

  submitClientWaitlist(event) {
    event.preventDefault();
    try {
      const clientName = document.getElementById('wl-client-name')?.value;
      const clientPhone = document.getElementById('wl-client-phone')?.value;
      const preferredPeriod = document.getElementById('wl-period')?.value;

      DB.addToWaitlist({
        clientName,
        clientPhone,
        serviceId: this.state.selectedServiceId,
        desiredDate: this.state.selectedDate,
        preferredPeriod
      });

      this.state.showClientWaitlistForm = false;
      this.notify('Você foi incluído na Lista de Espera! Avisaremos no seu WhatsApp assim que surgir uma vaga.');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  submitClientBooking(event) {
    event.preventDefault();
    try {
      const name = document.getElementById('client-name')?.value;
      const phone = document.getElementById('client-phone')?.value;
      const email = document.getElementById('client-email')?.value;
      const notes = document.getElementById('client-notes')?.value;
      const consent = document.getElementById('client-consent')?.checked;

      const appt = Scheduler.createAppointment({
        serviceId: this.state.selectedServiceId,
        date: this.state.selectedDate,
        startTime: this.state.selectedSlot,
        clientName: name,
        clientPhone: phone,
        clientEmail: email,
        notes,
        marketingConsent: consent,
        createdBy: 'CLIENTE'
      });

      this.state.lastConfirmedAppt = appt;
      this.state.selectedSlot = null;
      this.notify('Agendamento confirmado e notificação automática WhatsApp disparada!');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
      this.render();
    }
  },

  renderConfirmationScreen(appt) {
    const tenant = DB.getTenant();
    const formattedMsg = WhatsAppService.renderTemplate('CONFIRMATION', appt);
    const waUrl = this.buildWhatsAppUrl(tenant.phone, formattedMsg);

    return `
      <div class="max-w-lg mx-auto bg-zinc-900 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-5 shadow-2xl">
        <div class="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-3xl font-bold">
          ✓
        </div>
        <div>
          <span class="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            Reserva Confirmada + WhatsApp Enviado
          </span>
          <h2 class="text-2xl font-bold text-white mt-2">Tudo certo, ${appt.clientName}!</h2>
          <p class="text-sm text-zinc-400 mt-1">Sua confirmação automática já foi registrada para o seu WhatsApp (${this.formatPhoneBR(appt.clientPhone)}).</p>
        </div>

        <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-left space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-zinc-400">Código da reserva:</span>
            <span class="font-mono font-bold text-amber-400">${appt.code}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Serviço:</span>
            <span class="font-semibold text-white">${appt.serviceName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Data e Horário:</span>
            <span class="font-semibold text-white">${this.formatDateBR(appt.date)} • ${appt.startTime} às ${appt.endTime}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Valor estimado:</span>
            <span class="font-semibold text-emerald-400">${this.formatCurrency(appt.servicePrice)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Lembrete automático:</span>
            <span class="text-xs text-emerald-400">Programado (24h e 2h antes)</span>
          </div>
        </div>

        <div class="space-y-2.5 pt-2">
          <a
            href="${waUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition"
          >
            <span>📲</span> Abrir conversa no WhatsApp da Barbearia
          </a>

          <button
            type="button"
            onclick="App.state.lastConfirmedAppt = null; App.render();"
            class="w-full px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm transition"
          >
            Fazer outro agendamento
          </button>
        </div>
      </div>
    `;
  },

  // ============================================================================
  // 2. VISAO DO CLIENTE - MEUS HORARIOS, LISTA DE ESPERA E OPT-OUT LGPD
  // ============================================================================
  renderClientMyAppointmentsView() {
    const searchedPhone = this.state.clientLookupPhone || '';
    const cleanPhone = DB.normalizePhone(searchedPhone);
    const appointments = searchedPhone ? DB.getAppointments({ phone: searchedPhone }) : [];
    const waitlistEntries = searchedPhone ? DB.getWaitlist({ phone: searchedPhone }) : [];
    const clientRecord = cleanPhone
      ? DB.getClients().find(c => c.phone === cleanPhone)
      : null;

    const rescheduleAppt = this.state.reschedulingApptId
      ? appointments.find(a => a.id === this.state.reschedulingApptId)
      : null;

    let rescheduleModalHtml = '';
    if (rescheduleAppt) {
      const targetDate = this.state.rescheduleDate || rescheduleAppt.date;
      const avail = Scheduler.getAvailableSlots(targetDate, rescheduleAppt.serviceId, rescheduleAppt.id);
      rescheduleModalHtml = `
        <div class="p-4 rounded-xl bg-zinc-950 border border-amber-500/50 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-amber-400 text-sm">Remarcar ${rescheduleAppt.serviceName} (${rescheduleAppt.code})</h4>
            <button onclick="App.cancelReschedule()" class="text-xs text-zinc-400 hover:text-white">Fechar ✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Nova Data</label>
              <input
                type="date"
                value="${targetDate}"
                min="${Scheduler.getTodayDateStr()}"
                onchange="App.state.rescheduleDate = this.value; App.render();"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Novo Horário Disponível</label>
              <select id="reschedule-slot-select" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                ${avail.slots.length > 0
                  ? avail.slots.map(s => `<option value="${s.startTime}">${s.startTime} às ${s.endTime}</option>`).join('')
                  : '<option value="">Sem horários nesta data</option>'
                }
              </select>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onclick="App.confirmClientReschedule('${rescheduleAppt.id}')"
              ${avail.slots.length === 0 ? 'disabled' : ''}
              class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs disabled:opacity-40"
            >
              Salvar Novo Horário
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 class="text-lg font-bold text-white">Consultar meus agendamentos e preferências</h2>
          <p class="text-xs text-zinc-400">Informe seu celular com DDD para ver seus horários, acompanhar sua posição na Lista de Espera ou gerenciar o recebimento de promoções no WhatsApp.</p>

          <form onsubmit="App.searchClientAppointments(event)" class="flex flex-col sm:flex-row gap-3">
            <input
              type="tel"
              id="lookup-phone"
              value="${searchedPhone}"
              required
              placeholder="Ex: (11) 99999-8888"
              class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              class="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
            >
              Buscar
            </button>
          </form>
        </div>

        ${clientRecord ? `
          <!-- Controle de Consentimento LGPD / Opt-out Simples (Secao 5.3) -->
          <div class="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div class="text-xs font-bold uppercase tracking-wider text-amber-400">Privacidade & WhatsApp (LGPD)</div>
              <div class="text-sm font-semibold text-white mt-0.5">
                Status de campanhas promocionais:
                <span class="${clientRecord.marketingConsent ? 'text-emerald-400' : 'text-red-400'}">
                  ${clientRecord.marketingConsent ? 'Ativo (Recebendo promoções e avisos de encaixe)' : 'Desativado (Opt-out realizado)'}
                </span>
              </div>
              <p class="text-xs text-zinc-400">Você continuará recebendo confirmações e lembretes dos agendamentos que realizar.</p>
            </div>
            <button
              type="button"
              onclick="App.toggleClientOptOut('${clientRecord.phone}', ${!clientRecord.marketingConsent})"
              class="px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                clientRecord.marketingConsent
                  ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
              }"
            >
              ${clientRecord.marketingConsent ? '🔕 Parar de receber promoções' : '🔔 Voltar a receber promoções'}
            </button>
          </div>
        ` : ''}

        ${rescheduleModalHtml}

        ${searchedPhone ? `
          ${window.Phase3 ? Phase3.renderClientLoyaltyAndReviewsBox(searchedPhone) : ''}

          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-zinc-300">
              Meus Agendamentos (${appointments.length})
            </h3>
            ${appointments.length === 0 ? `
              <div class="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-sm">
                Nenhum agendamento encontrado para este telefone.
              </div>
            ` : appointments.map(a => {
              const badge = a.status === 'CONFIRMADO'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : a.status === 'CONCLUIDO'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30';

              const existingReview = window.Phase3 ? Phase3.getReviewByAppointment(a.id) : null;

              return `
                <div class="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-xs font-bold text-amber-400">${a.code}</span>
                        <span class="text-xs px-2.5 py-0.5 rounded-full border font-semibold ${badge}">${a.status}</span>
                        ${a.paymentMethod === 'FIDELIDADE_GRATIS' ? `
                          <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-bold">🎁 Prêmio Fidelidade</span>
                        ` : ''}
                      </div>
                      <div class="font-bold text-white text-base">${a.serviceName} (${this.formatCurrency(a.paidAmount !== undefined ? a.paidAmount : a.servicePrice)})</div>
                      <div class="text-xs text-zinc-300">
                        📅 ${this.formatDateBR(a.date)} • ⏰ ${a.startTime} às ${a.endTime} (${a.serviceDuration} min)
                      </div>
                    </div>

                    ${a.status === 'CONFIRMADO' ? `
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          onclick="App.startReschedule('${a.id}', '${a.date}')"
                          class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
                        >
                          Remarcar
                        </button>
                        <button
                          type="button"
                          onclick="App.clientCancelAppointment('${a.id}')"
                          class="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    ` : ''}
                  </div>

                  ${a.status === 'CONCLUIDO' ? (
                    existingReview ? `
                      <div class="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                        <span class="text-zinc-400">Sua avaliação: <strong class="text-amber-400">${'★'.repeat(existingReview.rating)}</strong> ${existingReview.comment ? `— "${existingReview.comment}"` : ''}</span>
                        <span class="text-emerald-400 font-semibold">✓ Avaliado</span>
                      </div>
                    ` : `
                      <form onsubmit="App.submitClientReview(event, '${a.id}')" class="pt-2.5 border-t border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <select id="rev-rating-${a.id}" class="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-bold">
                          <option value="5">★★★★★ (5 - Excelente)</option>
                          <option value="4">★★★★☆ (4 - Muito Bom)</option>
                          <option value="3">★★★☆☆ (3 - Regular)</option>
                          <option value="2">★★☆☆☆ (2 - Ruim)</option>
                          <option value="1">★☆☆☆☆ (1 - Péssimo)</option>
                        </select>
                        <input
                          type="text"
                          id="rev-comment-${a.id}"
                          placeholder="Deixe um elogio ou comentário sobre o atendimento..."
                          class="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                        <button type="submit" class="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shrink-0">
                          ⭐ Avaliar Atendimento
                        </button>
                      </form>
                    `
                  ) : ''}
                </div>
              `;
            }).join('')}
          </div>

          ${waitlistEntries.length > 0 ? `
            <div class="space-y-3 pt-3">
              <h3 class="text-sm font-semibold text-amber-400">
                ⏳ Minhas Solicitações na Lista de Espera (${waitlistEntries.length})
              </h3>
              ${waitlistEntries.map(w => `
                <div class="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-4">
                  <div>
                    <div class="font-bold text-white text-sm">${w.serviceName} • Data desejada: ${this.formatDateBR(w.desiredDate)}</div>
                    <div class="text-xs text-zinc-400">Turno: ${w.preferredPeriod} • Status: <strong class="text-amber-400">${w.status}</strong></div>
                  </div>
                  ${w.status === 'AGUARDANDO' ? `
                    <button
                      type="button"
                      onclick="DB.updateWaitlistStatus('${w.id}', 'CANCELADO'); App.notify('Removido da lista de espera.', 'info'); App.render();"
                      class="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-red-400 text-xs font-semibold"
                    >
                      Sair da Fila
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  },

  toggleClientOptOut(phone, newConsent) {
    try {
      DB.setClientMarketingConsent(phone, newConsent, 'CLIENTE');
      this.notify(
        newConsent
          ? 'Você voltou a autorizar o recebimento de promoções pelo WhatsApp.'
          : 'Opt-out confirmado! Você não receberá mais campanhas promocionais.',
        newConsent ? 'success' : 'info'
      );
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  searchClientAppointments(event) {
    event.preventDefault();
    const val = document.getElementById('lookup-phone')?.value || '';
    this.state.clientLookupPhone = val;
    this.state.reschedulingApptId = null;
    this.render();
  },

  startReschedule(apptId, currentDate) {
    this.state.reschedulingApptId = apptId;
    this.state.rescheduleDate = currentDate;
    this.render();
  },

  cancelReschedule() {
    this.state.reschedulingApptId = null;
    this.render();
  },

  confirmClientReschedule(apptId) {
    try {
      const targetDate = this.state.rescheduleDate;
      const newSlot = document.getElementById('reschedule-slot-select')?.value;
      if (!newSlot) {
        throw new Error('Escolha um horário válido.');
      }
      const res = Scheduler.rescheduleAppointment(apptId, targetDate, newSlot, 'CLIENTE');
      this.state.reschedulingApptId = null;
      this.notify('Agendamento remarcado e aviso enviado via WhatsApp!');
      if (res.matchingWaitlist && res.matchingWaitlist.length > 0) {
        this.notify(`${res.matchingWaitlist.length} cliente(s) na Lista de Espera podem aproveitar o horário liberado!`, 'info');
      }
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  clientCancelAppointment(apptId) {
    try {
      const res = Scheduler.updateAppointmentStatus(apptId, 'CANCELADO', 'CLIENTE');
      this.notify('Agendamento cancelado com sucesso.', 'info');
      if (res.matchingWaitlist && res.matchingWaitlist.length > 0) {
        this.notify(`A vaga liberada possui ${res.matchingWaitlist.length} interessado(s) na Lista de Espera!`, 'info');
      }
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  // ============================================================================
  // 3. PAINEL DO ADMINISTRADOR (BARBEIRO) - FASE 1 + FASE 2
  // ============================================================================
  renderAdminLoginView() {
    return `
      <div class="max-w-md mx-auto bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-amber-400">Acesso Restrito</span>
          <h2 class="text-xl font-bold text-white mt-1">Painel do Administrador</h2>
          <p class="text-xs text-zinc-400 mt-1">Gerencie a agenda, automações de WhatsApp, campanhas, lista de espera, serviços e expediente.</p>
        </div>

        <form onsubmit="App.handleAdminLogin(event)" class="space-y-4">
          <div>
            <label class="block text-xs text-zinc-300 mb-1">PIN de Acesso Administrativo</label>
            <input
              type="password"
              id="admin-pin-input"
              required
              placeholder="PIN padrão: 1234"
              class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
            />
            <p class="text-[11px] text-zinc-500 mt-1">Para testes, utilize a senha padrão: <strong class="text-zinc-300">1234</strong></p>
          </div>
          <button
            type="submit"
            class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
          >
            Entrar no Painel
          </button>
        </form>
      </div>
    `;
  },

  handleAdminLogin(event) {
    event.preventDefault();
    const pin = document.getElementById('admin-pin-input')?.value;
    const tenant = DB.getTenant();
    if (pin === (tenant?.adminPin || '1234')) {
      this.state.adminAuthenticated = true;
      this.notify('Bem-vindo ao painel administrativo!');
      this.render();
    } else {
      this.notify('PIN incorreto. Tente 1234.', 'error');
    }
  },

  renderAdminDashboardView() {
    const allAppts = DB.getAppointments();
    const todayStr = Scheduler.getTodayDateStr();
    const selectedDate = this.state.adminSelectedDate || todayStr;
    const dayAppts = allAppts.filter(a => a.date === selectedDate);

    const confirmedToday = dayAppts.filter(a => a.status === 'CONFIRMADO').length;
    const completedToday = dayAppts.filter(a => a.status === 'CONCLUIDO').length;
    const waitingCount = DB.getWaitlist({ status: 'AGUARDANDO' }).length;
    const pendingRemindersCount = WhatsAppService.getPendingReminders().length;

    const revenueDate = dayAppts
      .filter(a => a.status === 'CONFIRMADO' || a.status === 'CONCLUIDO')
      .reduce((acc, a) => acc + Number(a.servicePrice || 0), 0);

    const tabs = [
      { id: 'AGENDA', label: '📅 Agenda' },
      { id: 'FINANCE', label: '💰 Financeiro & Relatórios' },
      { id: 'WHATSAPP', label: `💬 WhatsApp & Campanhas ${pendingRemindersCount > 0 ? `(${pendingRemindersCount})` : ''}` },
      { id: 'WAITLIST', label: `⏳ Lista de Espera ${waitingCount > 0 ? `(${waitingCount})` : ''}` },
      { id: 'REVIEWS_SAAS', label: '⭐ Avaliações & SaaS' },
      { id: 'BLOCKS', label: '⛔ Bloqueios' },
      { id: 'SERVICES', label: '✂️ Serviços' },
      { id: 'HOURS', label: '🕒 Expediente' },
      { id: 'CLIENTS', label: '👥 Clientes & CSV' },
      { id: 'AUDIT', label: '🛡️ Auditoria' }
    ];

    return `
      <div class="space-y-6">
        <!-- Indicadores Gerenciais (Secao 7 + Fase 2) -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <span class="text-xs text-zinc-400">Confirmados (${this.formatDateBR(selectedDate)})</span>
            <div class="text-2xl font-bold text-amber-400 mt-1">${confirmedToday}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <span class="text-xs text-zinc-400">Concluídos no dia</span>
            <div class="text-2xl font-bold text-emerald-400 mt-1">${completedToday}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <span class="text-xs text-zinc-400">Fila de Espera Ativa</span>
            <div class="text-2xl font-bold text-amber-300 mt-1">${waitingCount}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <span class="text-xs text-zinc-400">Msgs WhatsApp Enviadas</span>
            <div class="text-2xl font-bold text-emerald-400 mt-1">${DB.getMessageLogs().length}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 col-span-2 sm:col-span-1">
            <span class="text-xs text-zinc-400">Previsão do Dia</span>
            <div class="text-xl font-bold text-white mt-1">${this.formatCurrency(revenueDate)}</div>
          </div>
        </div>

        <!-- Menu de Sub-abas do Admin -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div class="flex flex-wrap gap-1.5">
            ${tabs.map(t => `
              <button
                type="button"
                onclick="App.state.adminTab = '${t.id}'; App.render();"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  this.state.adminTab === t.id
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                }"
              >
                ${t.label}
              </button>
            `).join('')}
          </div>

          <button
            type="button"
            onclick="App.state.adminAuthenticated = false; App.render();"
            class="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800"
          >
            Sair
          </button>
        </div>

        <!-- Conteudo da Aba Ativa -->
        <div>
          ${this.renderAdminActiveTab()}
        </div>
      </div>
    `;
  },

  renderAdminActiveTab() {
    switch (this.state.adminTab) {
      case 'AGENDA':
        return this.renderAdminAgendaTab();
      case 'FINANCE':
        return window.Phase3 ? Phase3.renderAdminFinanceAndReportsTab() : '';
      case 'WHATSAPP':
        return this.renderAdminWhatsAppTab();
      case 'WAITLIST':
        return this.renderAdminWaitlistTab();
      case 'REVIEWS_SAAS':
        return window.Phase3 ? Phase3.renderAdminReviewsAndSaaSTab() : '';
      case 'BLOCKS':
        return this.renderAdminBlocksTab();
      case 'SERVICES':
        return this.renderAdminServicesTab();
      case 'HOURS':
        return this.renderAdminHoursTab();
      case 'CLIENTS':
        return this.renderAdminClientsTab();
      case 'AUDIT':
        return this.renderAdminAuditTab();
      default:
        return this.renderAdminAgendaTab();
    }
  },

  // --- ABA 1: AGENDA E CRIAR AGENDAMENTO MANUAL ---
  renderAdminAgendaTab() {
    const filterDate = this.state.adminShowAllDates ? null : this.state.adminSelectedDate;
    const appointments = DB.getAppointments({
      date: filterDate,
      status: this.state.adminFilterStatus
    });

    const services = DB.getServices(true);
    const manualServiceId = this.state.adminManualServiceId || (services[0]?.id || '');
    const manualDate = this.state.adminSelectedDate || Scheduler.getTodayDateStr();
    const manualAvailability = manualServiceId
      ? Scheduler.getAvailableSlots(manualDate, manualServiceId)
      : { slots: [] };

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-end justify-between gap-3">
            <div class="flex flex-wrap items-end gap-3">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Data da Agenda</label>
                <input
                  type="date"
                  value="${this.state.adminSelectedDate}"
                  onchange="App.state.adminSelectedDate = this.value; App.state.adminShowAllDates = false; App.render();"
                  class="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Status</label>
                <select
                  onchange="App.state.adminFilterStatus = this.value; App.render();"
                  class="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="ALL" ${this.state.adminFilterStatus === 'ALL' ? 'selected' : ''}>Todos</option>
                  <option value="CONFIRMADO" ${this.state.adminFilterStatus === 'CONFIRMADO' ? 'selected' : ''}>Confirmados</option>
                  <option value="CONCLUIDO" ${this.state.adminFilterStatus === 'CONCLUIDO' ? 'selected' : ''}>Concluídos</option>
                  <option value="CANCELADO" ${this.state.adminFilterStatus === 'CANCELADO' ? 'selected' : ''}>Cancelados</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onclick="App.state.adminShowAllDates = !App.state.adminShowAllDates; App.render();"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                this.state.adminShowAllDates
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:text-white'
              }"
            >
              ${this.state.adminShowAllDates ? 'Mostrando Todas as Datas' : 'Ver Agenda Completa'}
            </button>
          </div>

          <div class="space-y-3">
            ${appointments.length === 0 ? `
              <div class="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-sm">
                Nenhum agendamento encontrado para o filtro selecionado.
              </div>
            ` : appointments.map(a => {
              const statusColor = a.status === 'CONFIRMADO'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : a.status === 'CONCLUIDO'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30';

              const reminderMsg = WhatsAppService.renderTemplate('REMINDER_24H', a);
              const waClientUrl = this.buildWhatsAppUrl(a.clientPhone, reminderMsg);

              return `
                <div class="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 font-bold text-amber-400 text-sm">
                        ${a.startTime} - ${a.endTime}
                      </span>
                      <span class="text-xs text-zinc-400">${this.formatDateBR(a.date)}</span>
                      <span class="text-xs px-2.5 py-0.5 rounded-full border font-semibold ${statusColor}">${a.status}</span>
                      <span class="font-mono text-xs text-zinc-500">${a.code}</span>
                    </div>
                    <div class="font-bold text-white text-base">
                      ${a.clientName}
                      <span class="text-xs font-normal text-zinc-400 ml-1">(${this.formatPhoneBR(a.clientPhone)})</span>
                    </div>
                    <div class="text-xs text-zinc-300">
                      ✂️ <strong>${a.serviceName}</strong> • ${a.serviceDuration} min • <span class="text-emerald-400 font-semibold">${this.formatCurrency(a.servicePrice)}</span>
                      ${a.notes ? ` • 📝 <span class="italic text-zinc-400">${a.notes}</span>` : ''}
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <a
                      href="${waClientUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition"
                    >
                      📲 Lembrete WhatsApp
                    </a>
                    ${a.status === 'CONFIRMADO' ? `
                      <div class="flex items-center gap-1.5">
                        <select
                          id="pay-method-${a.id}"
                          class="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
                          title="Forma de Pagamento"
                        >
                          <option value="PIX">⚡ PIX</option>
                          <option value="CARTAO_CREDITO">💳 Crédito</option>
                          <option value="CARTAO_DEBITO">💳 Débito</option>
                          <option value="DINHEIRO">💵 Dinheiro</option>
                          <option value="FIDELIDADE_GRATIS">🎁 Fidelidade (Grátis)</option>
                        </select>
                        <button
                          type="button"
                          onclick="App.adminCompleteWithPayment('${a.id}')"
                          class="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition"
                        >
                          ✓ Concluir & Caixa
                        </button>
                      </div>
                      <button
                        type="button"
                        onclick="App.adminChangeStatus('${a.id}', 'CANCELADO')"
                        class="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold transition"
                      >
                        ✕ Cancelar
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Coluna Lateral: Novo Agendamento Manual -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 h-fit space-y-4">
          <h3 class="font-bold text-white text-base">➕ Novo Agendamento Manual</h3>
          <p class="text-xs text-zinc-400">Cadastre agendamentos de clientes via balcão ou telefone.</p>

          <form onsubmit="App.submitAdminManualBooking(event)" class="space-y-3">
            <div>
              <label class="block text-xs text-zinc-300 mb-1">Serviço</label>
              <select
                id="admin-manual-service"
                onchange="App.state.adminManualServiceId = this.value; App.render();"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                ${services.map(s => `
                  <option value="${s.id}" ${s.id === manualServiceId ? 'selected' : ''}>
                    ${s.name} (${s.durationMinutes}m - ${this.formatCurrency(s.price)})
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs text-zinc-300 mb-1">Data (${this.formatDateBR(manualDate)})</label>
              <input
                type="date"
                value="${manualDate}"
                min="${Scheduler.getTodayDateStr()}"
                onchange="App.state.adminSelectedDate = this.value; App.render();"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label class="block text-xs text-zinc-300 mb-1">Horário Disponível</label>
              <select
                id="admin-manual-slot"
                required
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                ${manualAvailability.slots.length > 0
                  ? manualAvailability.slots.map(s => `<option value="${s.startTime}">${s.startTime} às ${s.endTime}</option>`).join('')
                  : '<option value="">Sem horários livres nesta data</option>'
                }
              </select>
            </div>

            <div>
              <label class="block text-xs text-zinc-300 mb-1">Nome do Cliente *</label>
              <input
                type="text"
                id="admin-manual-name"
                required
                placeholder="Ex: Carlos Mendes"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label class="block text-xs text-zinc-300 mb-1">WhatsApp do Cliente *</label>
              <input
                type="tel"
                id="admin-manual-phone"
                required
                placeholder="(11) 98888-7777"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              ${manualAvailability.slots.length === 0 ? 'disabled' : ''}
              class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition disabled:opacity-40"
            >
              Registrar na Agenda
            </button>
          </form>
        </div>
      </div>
    `;
  },

  adminCompleteWithPayment(apptId) {
    try {
      const method = document.getElementById(`pay-method-${apptId}`)?.value || 'PIX';
      if (window.Phase3) {
        Phase3.completeAppointmentWithPayment(apptId, method);
        this.notify(`Atendimento concluído (${method})! Financeiro, Fidelidade e Convite de Avaliação registrados.`);
      } else {
        Scheduler.updateAppointmentStatus(apptId, 'CONCLUIDO', 'ADMIN');
      }
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  submitClientReview(event, apptId) {
    event.preventDefault();
    try {
      const rating = document.getElementById(`rev-rating-${apptId}`)?.value || 5;
      const comment = document.getElementById(`rev-comment-${apptId}`)?.value || '';
      Phase3.submitReview({ appointmentId: apptId, rating, comment });
      this.notify('Muito obrigado pela sua avaliação! ⭐');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  adminChangeStatus(apptId, newStatus) {
    try {
      const res = Scheduler.updateAppointmentStatus(apptId, newStatus, 'ADMIN');
      this.notify(`Status atualizado para ${newStatus}.`);
      if (newStatus === 'CANCELADO' && res.matchingWaitlist && res.matchingWaitlist.length > 0) {
        this.notify(
          `Atenção: Existem ${res.matchingWaitlist.length} cliente(s) na Lista de Espera para esta data! Veja a aba Lista de Espera.`,
          'info'
        );
      }
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  submitAdminManualBooking(event) {
    event.preventDefault();
    try {
      const serviceId = document.getElementById('admin-manual-service')?.value;
      const startTime = document.getElementById('admin-manual-slot')?.value;
      const clientName = document.getElementById('admin-manual-name')?.value;
      const clientPhone = document.getElementById('admin-manual-phone')?.value;

      Scheduler.createAppointment({
        serviceId,
        date: this.state.adminSelectedDate,
        startTime,
        clientName,
        clientPhone,
        marketingConsent: true,
        createdBy: 'ADMIN'
      });

      this.notify('Agendamento manual incluído e confirmação WhatsApp registrada!');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  // --- ABA 2 (FASE 2): CENTRAL WHATSAPP, LEMBRETES AUTOMATICOS E CAMPANHAS (Secoes 5 e 6) ---
  renderAdminWhatsAppTab() {
    const tenant = DB.getTenant();
    const waCfg = DB.getWhatsAppConfig();
    const pendingReminders = WhatsAppService.getPendingReminders();
    const messageLogs = DB.getMessageLogs();
    const services = DB.getServices(true);

    const vacantDate = this.state.vacantDate || this.getNextOpenDateStr();
    const vacantServiceId = this.state.vacantServiceId || (services[0]?.id || '');
    const vacantText = WhatsAppService.generateVacantSlotsText(vacantDate, vacantServiceId);

    const audience = WhatsAppService.getCampaignAudience(this.state.campaignSegment);
    const sampleClient = audience[0] || { name: 'João Cliente' };
    const campaignPreview = String(this.state.campaignTemplate || '')
      .split('{cliente}').join(sampleClient.name)
      .split('{barbearia}').join(tenant.name)
      .split('{link}').join(tenant.bookingUrl) +
      '\n\n_Para não receber mais promoções, acesse "Meus Horários" no link e desative campanhas._';

    return `
      <div class="space-y-6">
        <!-- Linha 1: Link de Agendamento + Divulgacao de Horarios Vagos (Secao 5.1 e 5.2) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Card 1: Compartilhar Link e Lembretes Pendentes -->
          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-white text-base">🔗 Link Oficial & Lembretes Automáticos (24h / 2h)</h3>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Automação Ativa
              </span>
            </div>

            <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="text-xs">
                <div class="text-zinc-400">Link de acesso do cliente (Seção 5.1):</div>
                <div class="font-mono text-amber-400 font-semibold mt-0.5 break-all">${tenant.bookingUrl}</div>
              </div>
              <button
                type="button"
                onclick="App.shareBookingLinkWhatsApp()"
                class="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0"
              >
                📲 Compartilhar no WhatsApp
              </button>
            </div>

            <!-- Fila de Lembretes 24h e 2h -->
            <div class="space-y-2.5 pt-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-zinc-300">
                  ⏰ Fila de Lembretes Próximos (${pendingReminders.length})
                </span>
                ${pendingReminders.length > 0 ? `
                  <button
                    type="button"
                    onclick="App.runAllPendingReminders()"
                    class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
                  >
                    ⚡ Disparar Todos (${pendingReminders.length})
                  </button>
                ` : ''}
              </div>

              ${pendingReminders.length === 0 ? `
                <div class="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400">
                  Nenhum lembrete de 24h ou 2h pendente no momento. Novos agendamentos para hoje ou amanhã aparecerão aqui automaticamente.
                </div>
              ` : pendingReminders.map(item => `
                <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                  <div class="text-xs">
                    <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">${item.label}</span>
                    <span class="font-bold text-white ml-1.5">${item.appointment.clientName}</span>
                    <div class="text-zinc-400 mt-0.5">
                      ${item.appointment.serviceName} • ${this.formatDateBR(item.appointment.date)} às ${item.appointment.startTime} (em ~${item.diffHours}h)
                    </div>
                  </div>
                  <div class="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onclick="App.sendSingleReminder('${item.appointment.id}', '${item.type}', false)"
                      class="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                    >
                      API
                    </button>
                    <button
                      type="button"
                      onclick="App.sendSingleReminder('${item.appointment.id}', '${item.type}', true)"
                      class="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold"
                    >
                      📲 Abrir
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Card 2: Gerador Automatico de Horarios Vagos para Status/Grupos (Secao 5.2) -->
          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div>
              <h3 class="font-bold text-white text-base">📢 Divulgação de Horários Vagos / Encaixes</h3>
              <p class="text-xs text-zinc-400">Gere uma lista atualizada dos horários livres do dia para postar no Status do WhatsApp ou enviar para clientes.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Data para divulgar</label>
                <input
                  type="date"
                  value="${vacantDate}"
                  min="${Scheduler.getTodayDateStr()}"
                  onchange="App.state.vacantDate = this.value; App.render();"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Serviço base</label>
                <select
                  onchange="App.state.vacantServiceId = this.value; App.render();"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  ${services.map(s => `
                    <option value="${s.id}" ${s.id === vacantServiceId ? 'selected' : ''}>${s.name} (${s.durationMinutes}m)</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <textarea
              id="vacant-slots-textarea"
              rows="6"
              readonly
              class="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 font-mono"
            >${vacantText}</textarea>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onclick="navigator.clipboard.writeText(document.getElementById('vacant-slots-textarea').value); App.notify('Texto copiado para a área de transferência!');"
                class="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition"
              >
                📋 Copiar Texto de Horários Vagos
              </button>
              <a
                href="https://wa.me/?text=${encodeURIComponent(vacantText)}"
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs text-center transition"
              >
                📲 Compartilhar no WhatsApp
              </a>
            </div>
          </div>
        </div>

        <!-- Linha 2: Campanhas Promocionais com Controle LGPD e Pre-visualizacao (Secao 5.2 e 5.3) -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 class="font-bold text-white text-base">🚀 Campanhas Promocionais & Comunicados (Com Filtro LGPD)</h3>
              <p class="text-xs text-zinc-400">Envie promoções, novos serviços ou campanhas para clientes inativos. Apenas contatos com consentimento ativo recebem o disparo.</p>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                onclick="App.setCampaignPreset('PROMO')"
                class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                🔥 Modelo Promoção
              </button>
              <button
                type="button"
                onclick="App.setCampaignPreset('INACTIVE')"
                class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                👋 Clientes Inativos
              </button>
              <button
                type="button"
                onclick="App.setCampaignPreset('NEWSERVICE')"
                class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                ✨ Novo Serviço
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onsubmit="App.submitCampaign(event)" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-zinc-300 mb-1">Nome da Campanha</label>
                  <input
                    type="text"
                    id="camp-title"
                    required
                    value="${this.state.campaignTitle}"
                    oninput="App.state.campaignTitle = this.value"
                    class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label class="block text-xs text-zinc-300 mb-1">Público-Alvo (Somente Opt-in LGPD)</label>
                  <select
                    id="camp-segment"
                    onchange="App.state.campaignSegment = this.value; App.render();"
                    class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="ALL_OPTIN" ${this.state.campaignSegment === 'ALL_OPTIN' ? 'selected' : ''}>
                      Todos os Clientes Autorizados
                    </option>
                    <option value="INACTIVE_30D" ${this.state.campaignSegment === 'INACTIVE_30D' ? 'selected' : ''}>
                      Clientes Inativos (Sem agendar há +30 dias)
                    </option>
                    <option value="RECURRING" ${this.state.campaignSegment === 'RECURRING' ? 'selected' : ''}>
                      Clientes Fiéis / Recorrentes (2+ visitas)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs text-zinc-300 mb-1">
                  Mensagem da Campanha (Variáveis: <code class="text-amber-400">{cliente}</code>, <code class="text-amber-400">{barbearia}</code>, <code class="text-amber-400">{link}</code>)
                </label>
                <textarea
                  id="camp-template"
                  rows="4"
                  required
                  oninput="App.state.campaignTemplate = this.value; App.render();"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white"
                >${this.state.campaignTemplate}</textarea>
              </div>

              <div class="flex items-center justify-between pt-1">
                <span class="text-xs text-zinc-400">
                  Destinatários elegíveis com consentimento: <strong class="text-emerald-400">${audience.length} contato(s)</strong>
                </span>
                <button
                  type="submit"
                  ${audience.length === 0 ? 'disabled' : ''}
                  class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition disabled:opacity-40"
                >
                  📲 Disparar Campanha (${audience.length})
                </button>
              </div>
            </form>

            <!-- Pre-visualizacao antes do disparo (Secao 5.2) -->
            <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div class="flex items-center justify-between text-xs text-zinc-400 mb-2">
                  <span class="font-semibold text-emerald-400">👁️ Pré-visualização da Mensagem no WhatsApp</span>
                  <span>Exemplo para: ${sampleClient.name}</span>
                </div>
                <div class="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-zinc-100 whitespace-pre-line leading-relaxed">
                  ${campaignPreview}
                </div>
              </div>
              <div class="text-[11px] text-zinc-500">
                ✓ Inclui rodapé automático de Opt-out (descadastramento) exigido pelas boas práticas da WhatsApp Business Platform e LGPD.
              </div>
            </div>
          </div>
        </div>

        <!-- Linha 3: Historico de Envios e Status de Entrega (Secao 5.3) -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-white text-base">📨 Registro de Envios e Status de Entrega (${messageLogs.length})</h3>
              <p class="text-xs text-zinc-400">Auditoria completa de confirmações, lembretes, avisos de lista de espera e campanhas disparadas.</p>
            </div>
          </div>

          <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
            ${messageLogs.length === 0 ? `
              <div class="p-6 text-center text-zinc-500 text-xs">Nenhuma mensagem disparada ainda.</div>
            ` : messageLogs.map(m => `
              <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div class="space-y-0.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold text-[11px]">${m.category}</span>
                    <span class="font-semibold text-white">${m.recipientName} (${this.formatPhoneBR(m.recipientPhone)})</span>
                    <span class="text-zinc-500">• ${m.eventType}</span>
                  </div>
                  <p class="text-zinc-400 line-clamp-2">${m.message}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                    ✓ ${m.deliveryStatus}
                  </span>
                  <span class="text-zinc-500 text-[11px]">${new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  shareBookingLinkWhatsApp() {
    const tenant = DB.getTenant();
    const msg = `Olá! 💈 Agende seu horário na *${tenant.name}* de forma rápida e sem fila pelo nosso link oficial:\n👉 ${tenant.bookingUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  },

  sendSingleReminder(apptId, type, openWhatsApp) {
    try {
      WhatsAppService.dispatchReminder(apptId, type, openWhatsApp);
      this.notify('Lembrete enviado e registrado!');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  runAllPendingReminders() {
    const count = WhatsAppService.dispatchAllPendingReminders();
    this.notify(`${count} lembrete(s) disparado(s) com sucesso!`);
    this.render();
  },

  setCampaignPreset(preset) {
    if (preset === 'PROMO') {
      this.state.campaignTitle = 'Promoção da Semana';
      this.state.campaignSegment = 'ALL_OPTIN';
      this.state.campaignTemplate = 'Fala, *{cliente}*! 💈 Semana especial na *{barbearia}* com combo Cabelo + Barba e horários abertos. Reserve agora pelo link: {link}';
    } else if (preset === 'INACTIVE') {
      this.state.campaignTitle = 'Sentimos sua falta';
      this.state.campaignSegment = 'INACTIVE_30D';
      this.state.campaignTemplate = 'Olá, *{cliente}*! Faz tempo que você não dá um trato no visual aqui na *{barbearia}*. ✂️ Que tal agendar seu horário para essa semana? Acesse: {link}';
    } else if (preset === 'NEWSERVICE') {
      this.state.campaignTitle = 'Novidade na Barbearia';
      this.state.campaignSegment = 'ALL_OPTIN';
      this.state.campaignTemplate = 'Novidade na *{barbearia}*, *{cliente}*! 🔥 Confira nossos serviços atualizados e escolha seu horário sem fila: {link}';
    }
    this.render();
  },

  submitCampaign(event) {
    event.preventDefault();
    try {
      const count = WhatsAppService.dispatchCampaign({
        title: this.state.campaignTitle,
        segment: this.state.campaignSegment,
        messageTemplate: this.state.campaignTemplate
      });
      this.notify(`Campanha disparada com sucesso para ${count} cliente(s) autorizados!`);
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  // --- ABA 3 (FASE 2): LISTA DE ESPERA INTELIGENTE (Secao 8.1) ---
  renderAdminWaitlistTab() {
    const waitlist = DB.getWaitlist();

    return `
      <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="font-bold text-white text-base">⏳ Gestão da Lista de Espera (${waitlist.length})</h3>
            <p class="text-xs text-zinc-400">Clientes que solicitaram aviso caso surja vaga. O sistema verifica automaticamente se há horários livres na data desejada.</p>
          </div>
        </div>

        ${waitlist.length === 0 ? `
          <div class="p-8 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-center text-zinc-400 text-sm">
            Nenhum cliente na Lista de Espera no momento.
          </div>
        ` : `
          <div class="space-y-3">
            ${waitlist.map(w => {
              const avail = Scheduler.getAvailableSlots(w.desiredDate, w.serviceId);
              const hasFreeSlots = avail.available && avail.slots.length > 0;
              const firstFreeSlot = hasFreeSlots ? avail.slots[0].startTime : null;

              return `
                <div class="p-4 rounded-xl bg-zinc-950/90 border ${
                  hasFreeSlots && w.status === 'AGUARDANDO' ? 'border-amber-500' : 'border-zinc-800'
                } flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-bold text-white text-sm">${w.clientName}</span>
                      <span class="text-xs text-zinc-400">(${this.formatPhoneBR(w.clientPhone)})</span>
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        w.status === 'AGUARDANDO'
                          ? 'bg-amber-500/15 text-amber-400'
                          : w.status === 'NOTIFICADO'
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                      }">
                        ${w.status}
                      </span>
                      ${hasFreeSlots && w.status !== 'ATENDIDO' && w.status !== 'CANCELADO' ? `
                        <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                          🎉 ${avail.slots.length} vaga(s) aberta(s) nesta data!
                        </span>
                      ` : ''}
                    </div>
                    <div class="text-xs text-zinc-300">
                      ✂️ <strong>${w.serviceName}</strong> (${w.serviceDuration}m) • 📅 Data desejada: <strong>${this.formatDateBR(w.desiredDate)}</strong> • Turno: ${w.preferredPeriod}
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 shrink-0">
                    ${w.status !== 'ATENDIDO' && w.status !== 'CANCELADO' ? `
                      <button
                        type="button"
                        onclick="App.adminNotifyWaitlist('${w.id}')"
                        class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                      >
                        📲 Avisar Vaga no WhatsApp
                      </button>
                      ${firstFreeSlot ? `
                        <button
                          type="button"
                          onclick="App.adminConvertWaitlistToAppt('${w.id}', '${firstFreeSlot}')"
                          class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition"
                        >
                          ⚡ Agendar às ${firstFreeSlot}
                        </button>
                      ` : ''}
                      <button
                        type="button"
                        onclick="DB.updateWaitlistStatus('${w.id}', 'CANCELADO'); App.render();"
                        class="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400 text-xs"
                      >
                        Remover
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  adminNotifyWaitlist(waitlistId) {
    try {
      WhatsAppService.notifyWaitlistEntry(waitlistId, true);
      this.notify('Cliente notificado pelo WhatsApp!');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  adminConvertWaitlistToAppt(waitlistId, slotStartTime) {
    try {
      const entry = DB.getWaitlist().find(w => w.id === waitlistId);
      if (!entry) throw new Error('Registro não encontrado.');

      const appt = Scheduler.createAppointment({
        serviceId: entry.serviceId,
        date: entry.desiredDate,
        startTime: slotStartTime,
        clientName: entry.clientName,
        clientPhone: entry.clientPhone,
        marketingConsent: true,
        createdBy: 'ADMIN_LISTA_ESPERA',
        waitlistId: entry.id
      });

      this.notify(`Lista de espera convertida no agendamento ${appt.code} (${slotStartTime})!`);
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  // --- ABA 4: BLOQUEIO MANUAL DE HORARIOS / FERIADOS (Secao 3.2) ---
  renderAdminBlocksTab() {
    const blocks = DB.getBlockedSlots();

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
          <h3 class="font-bold text-white text-base">⛔ Bloquear Horário ou Feriado</h3>
          <p class="text-xs text-zinc-400">Bloqueie períodos específicos (compromissos, imprevistos) ou o dia inteiro (feriados, férias).</p>

          <form onsubmit="App.submitAdminBlock(event)" class="space-y-3">
            <div>
              <label class="block text-xs text-zinc-300 mb-1">Data do Bloqueio *</label>
              <input
                type="date"
                id="block-date"
                required
                value="${this.state.adminSelectedDate}"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <label class="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer py-1">
              <input
                type="checkbox"
                id="block-fullday"
                onchange="document.getElementById('block-time-range').classList.toggle('hidden', this.checked)"
                class="accent-amber-500"
              />
              <span>Fechar o dia inteiro (Feriado / Folga)</span>
            </label>

            <div id="block-time-range" class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Início</label>
                <input
                  type="time"
                  id="block-start"
                  value="14:00"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Fim</label>
                <input
                  type="time"
                  id="block-end"
                  value="16:00"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs text-zinc-300 mb-1">Motivo *</label>
              <input
                type="text"
                id="block-reason"
                required
                placeholder="Ex: Consulta médica / Feriado Nacional"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
            >
              Salvar Bloqueio
            </button>
          </form>
        </div>

        <div class="lg:col-span-2 space-y-3">
          <h3 class="font-bold text-white text-base">Bloqueios e Exceções Cadastrados (${blocks.length})</h3>
          ${blocks.length === 0 ? `
            <div class="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-sm text-center">
              Nenhum bloqueio manual ou feriado cadastrado.
            </div>
          ` : blocks.map(b => `
            <div class="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-white text-sm">${this.formatDateBR(b.date)}</span>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                    ${b.isFullDay ? 'Dia Inteiro' : `${b.startTime} às ${b.endTime}`}
                  </span>
                </div>
                <p class="text-xs text-zinc-300 mt-1">${b.reason}</p>
              </div>
              <button
                type="button"
                onclick="App.removeBlock('${b.id}')"
                class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-300 text-xs font-semibold transition"
              >
                Remover
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  submitAdminBlock(event) {
    event.preventDefault();
    const date = document.getElementById('block-date')?.value;
    const isFullDay = document.getElementById('block-fullday')?.checked;
    const startTime = document.getElementById('block-start')?.value;
    const endTime = document.getElementById('block-end')?.value;
    const reason = document.getElementById('block-reason')?.value;

    if (!isFullDay && startTime >= endTime) {
      this.notify('O horário de término deve ser maior que o horário de início.', 'error');
      return;
    }

    DB.addBlockedSlot({ date, startTime, endTime, reason, isFullDay });
    this.notify('Bloqueio registrado na agenda!');
    this.render();
  },

  removeBlock(blockId) {
    DB.removeBlockedSlot(blockId);
    this.notify('Bloqueio removido.', 'info');
    this.render();
  },

  // --- ABA 5: CADASTRO E EDICAO DE SERVICOS (Secao 4) ---
  renderAdminServicesTab() {
    const services = DB.getServices(false);
    const editing = this.state.editingService || null;

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
          <h3 class="font-bold text-white text-base">
            ${editing ? `✏️ Editar: ${editing.name}` : '➕ Cadastrar Novo Serviço'}
          </h3>
          <form onsubmit="App.submitServiceForm(event)" class="space-y-3">
            <input type="hidden" id="srv-id" value="${editing ? editing.id : ''}" />
            <div>
              <label class="block text-xs text-zinc-300 mb-1">Nome do Serviço *</label>
              <input
                type="text"
                id="srv-name"
                required
                value="${editing ? editing.name : ''}"
                placeholder="Ex: Corte Degradê"
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Duração (min) *</label>
                <input
                  type="number"
                  id="srv-duration"
                  required
                  min="5"
                  step="5"
                  value="${editing ? editing.durationMinutes : 30}"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  id="srv-price"
                  required
                  min="0"
                  step="0.50"
                  value="${editing ? editing.price : 35}"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs text-zinc-300 mb-1">Descrição</label>
              <textarea
                id="srv-desc"
                rows="2"
                placeholder="Detalhes do atendimento..."
                class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
              >${editing ? (editing.description || '') : ''}</textarea>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
              >
                ${editing ? 'Salvar Alterações' : 'Adicionar Serviço'}
              </button>
              ${editing ? `
                <button
                  type="button"
                  onclick="App.state.editingService = null; App.render();"
                  class="px-3 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
              ` : ''}
            </div>
          </form>
        </div>

        <div class="lg:col-span-2 space-y-3">
          <h3 class="font-bold text-white text-base">Catálogo de Serviços da Barbearia (${services.length})</h3>
          ${services.map(s => `
            <div class="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-white text-base">${s.name}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${
                    s.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                  }">
                    ${s.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">${s.description || ''}</p>
                <div class="text-xs text-amber-400 font-semibold mt-1">
                  ⏱ ${s.durationMinutes} minutos • ${this.formatCurrency(s.price)}
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onclick="App.startEditService('${s.id}')"
                  class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onclick="App.toggleService('${s.id}')"
                  class="px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    s.active
                      ? 'border-zinc-700 text-zinc-400 hover:text-white'
                      : 'border-emerald-500/40 text-emerald-400'
                  }"
                >
                  ${s.active ? 'Inativar' : 'Ativar'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  startEditService(serviceId) {
    this.state.editingService = DB.getServiceById(serviceId);
    this.render();
  },

  submitServiceForm(event) {
    event.preventDefault();
    const id = document.getElementById('srv-id')?.value;
    const name = document.getElementById('srv-name')?.value;
    const durationMinutes = document.getElementById('srv-duration')?.value;
    const price = document.getElementById('srv-price')?.value;
    const description = document.getElementById('srv-desc')?.value;

    DB.saveService({
      id: id || null,
      name,
      durationMinutes,
      price,
      description,
      active: this.state.editingService ? this.state.editingService.active : true
    });

    this.state.editingService = null;
    this.notify('Serviço salvo com sucesso!');
    this.render();
  },

  toggleService(serviceId) {
    DB.toggleServiceActive(serviceId);
    this.notify('Status do serviço atualizado.');
    this.render();
  },

  // --- ABA 6: HORARIOS DE FUNCIONAMENTO (Secao 3.1) ---
  renderAdminHoursTab() {
    const hours = DB.getBusinessHours();
    return `
      <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h3 class="font-bold text-white text-base">🕒 Configuração de Expediente e Intervalo de Almoço</h3>
          <p class="text-xs text-zinc-400 mt-0.5">Personalize os dias abertos, horário de abertura/fechamento e pausa de almoço sem mexer no código (Seção 3.1).</p>
        </div>

        <form onsubmit="App.submitBusinessHours(event)" class="space-y-3">
          <div class="space-y-2.5">
            ${hours.map(bh => `
              <div class="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 grid grid-cols-1 sm:grid-cols-6 items-center gap-3">
                <div class="sm:col-span-2 flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="bh-open-${bh.dayOfWeek}"
                    ${bh.isOpen ? 'checked' : ''}
                    class="accent-amber-500 w-4 h-4"
                  />
                  <label for="bh-open-${bh.dayOfWeek}" class="font-semibold text-sm text-white cursor-pointer">
                    ${bh.dayName}
                  </label>
                </div>

                <div>
                  <label class="block text-[11px] text-zinc-400">Abertura</label>
                  <input
                    type="time"
                    id="bh-start-${bh.dayOfWeek}"
                    value="${bh.openTime}"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label class="block text-[11px] text-zinc-400">Fechamento</label>
                  <input
                    type="time"
                    id="bh-end-${bh.dayOfWeek}"
                    value="${bh.closeTime}"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label class="block text-[11px] text-zinc-400">Início Almoço</label>
                  <input
                    type="time"
                    id="bh-bstart-${bh.dayOfWeek}"
                    value="${bh.breakStart || ''}"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label class="block text-[11px] text-zinc-400">Fim Almoço</label>
                  <input
                    type="time"
                    id="bh-bend-${bh.dayOfWeek}"
                    value="${bh.breakEnd || ''}"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            `).join('')}
          </div>

          <div class="pt-2 flex justify-end">
            <button
              type="submit"
              class="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition"
            >
              Salvar Horários de Funcionamento
            </button>
          </div>
        </form>
      </div>
    `;
  },

  submitBusinessHours(event) {
    event.preventDefault();
    const current = DB.getBusinessHours();
    const updated = current.map(bh => {
      const d = bh.dayOfWeek;
      return {
        dayOfWeek: d,
        dayName: bh.dayName,
        isOpen: document.getElementById(`bh-open-${d}`)?.checked || false,
        openTime: document.getElementById(`bh-start-${d}`)?.value || '09:00',
        closeTime: document.getElementById(`bh-end-${d}`)?.value || '19:00',
        breakStart: document.getElementById(`bh-bstart-${d}`)?.value || '',
        breakEnd: document.getElementById(`bh-bend-${d}`)?.value || ''
      };
    });
    DB.saveBusinessHours(updated);
    this.notify('Expediente atualizado com sucesso!');
    this.render();
  },

  // --- ABA 7: CLIENTES, CADASTRO MANUAL E IMPORTACAO CSV (Secao 5.3) ---
  renderAdminClientsTab() {
    const clients = DB.getClients();
    const allAppts = DB.getAppointments();

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Coluna Lateral: Cadastro Manual + Importacao CSV (Secao 5.3) -->
        <div class="space-y-4">
          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-white text-base">➕ Cadastrar Contato Manual</h3>
            <form onsubmit="App.submitManualClient(event)" class="space-y-3">
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  id="new-cli-name"
                  required
                  placeholder="Ex: Marcos Oliveira"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1">WhatsApp com DDD *</label>
                <input
                  type="tel"
                  id="new-cli-phone"
                  required
                  placeholder="(11) 97777-6666"
                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <label class="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input type="checkbox" id="new-cli-consent" checked class="accent-amber-500" />
                <span>Possui autorização para campanhas WhatsApp (LGPD)</span>
              </label>
              <button
                type="submit"
                class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition"
              >
                Salvar Contato
              </button>
            </form>
          </div>

          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-white text-base">📥 Importar Contatos via CSV</h3>
            <p class="text-xs text-zinc-400">Cole abaixo linhas no formato <code class="text-amber-400">Nome, Telefone, Email, Consentimento(sim/nao)</code> (Seção 5.3).</p>
            <textarea
              id="csv-import-input"
              rows="4"
              placeholder="Exemplo:&#10;Lucas Pereira, 11988881111, lucas@email.com, sim&#10;André Santos, 11977772222, , sim"
              class="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white font-mono"
            ></textarea>
            <button
              type="button"
              onclick="App.handleCSVImport()"
              class="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition"
            >
              Importar Lista CSV
            </button>
          </div>
        </div>

        <!-- Lista de Clientes -->
        <div class="lg:col-span-2 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
          <div>
            <h3 class="font-bold text-white text-base">👥 Base de Clientes (${clients.length})</h3>
            <p class="text-xs text-zinc-400">Clique no botão de consentimento para ativar ou revogar o envio de campanhas promocionais (Opt-in / Opt-out).</p>
          </div>

          ${clients.length === 0 ? `
            <div class="p-6 text-center text-zinc-400 text-sm">Nenhum cliente registrado ainda.</div>
          ` : `
            <div class="space-y-2.5">
              ${clients.map(c => {
                const history = allAppts.filter(a => a.clientId === c.id);
                const completed = history.filter(a => a.status === 'CONCLUIDO').length;
                return `
                  <div class="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div class="font-bold text-white text-sm">${c.name}</div>
                      <div class="text-xs text-zinc-400">${this.formatPhoneBR(c.phone)} ${c.email ? `• ${c.email}` : ''}</div>
                      <div class="text-xs text-amber-400 mt-0.5">
                        Reservas: ${history.length} • Concluídos: ${completed} • Origem: ${c.source || 'AGENDAMENTO'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onclick="App.adminToggleClientConsent('${c.id}', ${!c.marketingConsent})"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition shrink-0 ${
                        c.marketingConsent
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                      }"
                    >
                      ${c.marketingConsent ? '✓ Opt-in Ativo (Campanhas)' : '🔕 Sem Campanhas (Opt-out)'}
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  submitManualClient(event) {
    event.preventDefault();
    try {
      const name = document.getElementById('new-cli-name')?.value;
      const phone = document.getElementById('new-cli-phone')?.value;
      const consent = document.getElementById('new-cli-consent')?.checked;
      DB.upsertClient({ name, phone, marketingConsent: consent, source: 'CADASTRO_MANUAL' });
      this.notify('Contato salvo com sucesso!');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  handleCSVImport() {
    const raw = document.getElementById('csv-import-input')?.value;
    if (!raw || !raw.trim()) {
      this.notify('Cole pelo menos uma linha CSV no formato Nome, Telefone.', 'error');
      return;
    }
    const count = DB.importClientsFromCSV(raw, true);
    if (count > 0) {
      this.notify(`${count} contato(s) importado(s) com sucesso!`);
      this.render();
    } else {
      this.notify('Nenhum contato válido encontrado. Verifique o formato: Nome, Telefone', 'error');
    }
  },

  adminToggleClientConsent(clientId, newConsent) {
    try {
      DB.setClientMarketingConsent(clientId, newConsent, 'ADMIN');
      this.notify('Status de consentimento LGPD atualizado.');
      this.render();
    } catch (err) {
      this.notify(err.message, 'error');
    }
  },

  // --- ABA 8: AUDITORIA (Secao 9) ---
  renderAdminAuditTab() {
    const logs = DB.getAuditLogs();
    return `
      <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-white text-base">🛡️ Registro de Auditoria (Seção 9)</h3>
            <p class="text-xs text-zinc-400">Histórico de agendamentos, disparos de WhatsApp, consentimento LGPD, lista de espera e alterações.</p>
          </div>
          <button
            type="button"
            onclick="if(confirm('Deseja restaurar os dados iniciais de fábrica?')) { DB.resetToSeed(); App.init(); }"
            class="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold"
          >
            Restaurar Dados de Fábrica
          </button>
        </div>

        <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
          ${logs.length === 0 ? `
            <div class="text-xs text-zinc-500">Nenhuma operação registrada ainda.</div>
          ` : logs.map(l => `
            <div class="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <div>
                <span class="font-mono font-bold text-amber-400 mr-2">[${l.action}]</span>
                <span class="text-zinc-200">${l.details}</span>
              </div>
              <span class="text-zinc-500 shrink-0">${new Date(l.timestamp).toLocaleString('pt-BR')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
