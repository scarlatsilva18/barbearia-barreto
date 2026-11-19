/**
 * Modulo Fase 3 — Gestao, Financeiro, Fidelidade, Avaliacoes, Relatorios e Multi-Barbearia (SaaS)
 * Implementado de forma modular (sem multiplos barbeiros, conforme solicitado) para maxima economia de tokens.
 */

window.Phase3 = {
  LOYALTY_GOAL: 10, // A cada 10 atendimentos concluidos = 1 corte gratuito (Secao 8.2)

  ensureSchema() {
    const data = DB.init();
    let changed = false;

    if (!data.financialTransactions) {
      data.financialTransactions = [];
      changed = true;
    }
    if (!data.reviews) {
      data.reviews = [];
      changed = true;
    }
    if (!data.loyaltyRedemptions) {
      data.loyaltyRedemptions = [];
      changed = true;
    }

    if (changed) {
      DB.save(data);
    }
    return data;
  },

  // ==========================================================================
  // 1. CONTROLE FINANCEIRO (Secao 8.3)
  // ==========================================================================
  getTransactions() {
    const data = this.ensureSchema();
    return data.financialTransactions
      .filter(t => t.tenantId === DB.tenantId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },

  completeAppointmentWithPayment(appointmentId, paymentMethod = 'PIX', customAmount = null) {
    const data = this.ensureSchema();
    const appt = data.appointments.find(a => a.id === appointmentId && a.tenantId === DB.tenantId);
    if (!appt) throw new Error('Agendamento não encontrado.');

    const isFreeLoyalty = paymentMethod === 'FIDELIDADE_GRATIS';
    const finalAmount = isFreeLoyalty
      ? 0
      : (customAmount !== null && customAmount !== '' ? Number(customAmount) : Number(appt.servicePrice));

    appt.status = 'CONCLUIDO';
    appt.paymentMethod = paymentMethod;
    appt.paidAmount = finalAmount;
    appt.completedAt = new Date().toISOString();

    // Evita duplicar lancamento financeiro se ja existir para este agendamento
    const existingIdx = data.financialTransactions.findIndex(
      t => t.appointmentId === appt.id && t.tenantId === DB.tenantId
    );

    const txRecord = {
      id: existingIdx !== -1 ? data.financialTransactions[existingIdx].id : 'fin-' + Date.now(),
      tenantId: DB.tenantId,
      appointmentId: appt.id,
      appointmentCode: appt.code,
      clientId: appt.clientId,
      clientName: appt.clientName,
      serviceName: appt.serviceName,
      date: appt.date,
      amount: finalAmount,
      paymentMethod, // 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO' | 'FIDELIDADE_GRATIS'
      createdAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      data.financialTransactions[existingIdx] = txRecord;
    } else {
      data.financialTransactions.unshift(txRecord);
    }

    // Se foi resgate de fidelidade, registra o resgate
    if (isFreeLoyalty) {
      data.loyaltyRedemptions.push({
        id: 'loy-' + Date.now(),
        tenantId: DB.tenantId,
        clientId: appt.clientId,
        clientPhone: DB.normalizePhone(appt.clientPhone),
        clientName: appt.clientName,
        appointmentId: appt.id,
        date: appt.date,
        createdAt: new Date().toISOString()
      });
    }

    DB.save(data);
    DB.logAudit(
      'ATENDIMENTO_FINANCEIRO',
      `Atendimento ${appt.code} (${appt.clientName}) concluído • Recebido: R$ ${finalAmount.toFixed(2)} via ${paymentMethod}.`
    );

    // Envia convite de avaliacao no log do WhatsApp (Secao 8.4)
    if (window.WhatsAppService) {
      const tenant = DB.getTenant();
      DB.addMessageLog({
        recipientName: appt.clientName,
        recipientPhone: appt.clientPhone,
        category: 'POS_ATENDIMENTO',
        eventType: 'CONVITE_AVALIACAO',
        message: `Obrigado pela visita hoje na *${tenant.name}*, *${appt.clientName}*! ⭐ Avalie seu atendimento e acompanhe seus selos no Cartão Fidelidade acessando "Meus Horários" em: ${tenant.bookingUrl}`,
        deliveryStatus: 'ENTREGUE',
        channel: 'CLOUD_API_SIMULADA'
      });
    }

    return { appointment: appt, transaction: txRecord };
  },

  getFinancialSummary(referenceDateStr) {
    const txs = this.getTransactions();
    const refDate = referenceDateStr || Scheduler.getTodayDateStr();
    const refMonth = refDate.slice(0, 7); // YYYY-MM

    // Calcula janela da semana (7 dias ate a data de referencia)
    const [y, m, d] = refDate.split('-').map(Number);
    const refObj = new Date(y, m - 1, d);
    const weekStartObj = new Date(refObj);
    weekStartObj.setDate(refObj.getDate() - 6);
    const weekStartStr = weekStartObj.toISOString().slice(0, 10);

    let dailyTotal = 0;
    let weeklyTotal = 0;
    let monthlyTotal = 0;
    const byMethod = {
      PIX: 0,
      CARTAO_CREDITO: 0,
      CARTAO_DEBITO: 0,
      DINHEIRO: 0,
      FIDELIDADE_GRATIS: 0
    };

    txs.forEach(t => {
      const val = Number(t.amount || 0);
      if (t.date === refDate) dailyTotal += val;
      if (t.date >= weekStartStr && t.date <= refDate) weeklyTotal += val;
      if (t.date.startsWith(refMonth)) {
        monthlyTotal += val;
        byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] || 0) + val;
      }
    });

    return {
      dailyTotal,
      weeklyTotal,
      monthlyTotal,
      byMethod,
      totalTransactions: txs.length
    };
  },

  // ==========================================================================
  // 2. PROGRAMA DE FIDELIDADE (Secao 8.2)
  // ==========================================================================
  getClientLoyaltyStatus(phoneOrClientId) {
    const data = this.ensureSchema();
    const cleanPhone = DB.normalizePhone(phoneOrClientId);

    // Conta todos os atendimentos CONCLUIDOS pagos pelo cliente
    const completedPaid = data.appointments.filter(a =>
      a.tenantId === DB.tenantId &&
      a.status === 'CONCLUIDO' &&
      a.paymentMethod !== 'FIDELIDADE_GRATIS' &&
      (a.clientId === phoneOrClientId || DB.normalizePhone(a.clientPhone) === cleanPhone)
    ).length;

    const redemptionsCount = data.loyaltyRedemptions.filter(r =>
      r.tenantId === DB.tenantId &&
      (r.clientId === phoneOrClientId || DB.normalizePhone(r.clientPhone) === cleanPhone)
    ).length;

    const totalEarnedRewards = Math.floor(completedPaid / this.LOYALTY_GOAL);
    const availableFreeCuts = Math.max(0, totalEarnedRewards - redemptionsCount);
    const currentCycleStamps = completedPaid % this.LOYALTY_GOAL;
    const remainingForNext = this.LOYALTY_GOAL - currentCycleStamps;

    return {
      goal: this.LOYALTY_GOAL,
      completedPaid,
      redemptionsCount,
      availableFreeCuts,
      currentCycleStamps,
      remainingForNext
    };
  },

  // ==========================================================================
  // 3. AVALIACAO DO ATENDIMENTO (Secao 8.4)
  // ==========================================================================
  getReviews() {
    const data = this.ensureSchema();
    return data.reviews
      .filter(r => r.tenantId === DB.tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getReviewByAppointment(appointmentId) {
    return this.getReviews().find(r => r.appointmentId === appointmentId);
  },

  submitReview({ appointmentId, rating, comment }) {
    const data = this.ensureSchema();
    const appt = data.appointments.find(a => a.id === appointmentId && a.tenantId === DB.tenantId);
    if (!appt) throw new Error('Agendamento não localizado para avaliação.');
    if (appt.status !== 'CONCLUIDO') throw new Error('Apenas atendimentos concluídos podem ser avaliados.');

    const existing = data.reviews.find(r => r.appointmentId === appointmentId && r.tenantId === DB.tenantId);
    if (existing) throw new Error('Este atendimento já foi avaliado. Obrigado!');

    const review = {
      id: 'rev-' + Date.now(),
      tenantId: DB.tenantId,
      appointmentId: appt.id,
      appointmentCode: appt.code,
      clientName: appt.clientName,
      clientPhone: appt.clientPhone,
      serviceName: appt.serviceName,
      date: appt.date,
      rating: Math.min(5, Math.max(1, Number(rating || 5))),
      comment: (comment || '').trim(),
      createdAt: new Date().toISOString()
    };

    data.reviews.unshift(review);
    DB.save(data);
    DB.logAudit('AVALIACAO_RECEBIDA', `${review.clientName} avaliou ${review.serviceName} com ${review.rating} estrela(s).`);
    return review;
  },

  // ==========================================================================
  // 4. INDICADORES AVANCADOS E MULTI-BARBEARIA SAAS (Secao 7 e Secao 12)
  // ==========================================================================
  getAdvancedMetrics() {
    const appts = DB.getAppointments();
    const clients = DB.getClients();
    const reviews = this.getReviews();

    // Ranking de servicos mais procurados
    const serviceMap = {};
    appts.filter(a => a.status !== 'CANCELADO').forEach(a => {
      if (!serviceMap[a.serviceName]) {
        serviceMap[a.serviceName] = { name: a.serviceName, count: 0, revenue: 0 };
      }
      serviceMap[a.serviceName].count++;
      serviceMap[a.serviceName].revenue += Number(a.paidAmount !== undefined ? a.paidAmount : a.servicePrice);
    });
    const topServices = Object.values(serviceMap).sort((a, b) => b.count - a.count);

    // Clientes novos vs recorrentes
    let newClientsCount = 0;
    let recurringClientsCount = 0;
    clients.forEach(c => {
      const visits = appts.filter(a => a.clientId === c.id && a.status !== 'CANCELADO').length;
      if (visits >= 2) recurringClientsCount++;
      else newClientsCount++;
    });

    // Media de avaliacoes
    const avgRating = reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + Number(r.rating), 0) / reviews.length).toFixed(1)
      : '5.0';

    return {
      topServices,
      newClientsCount,
      recurringClientsCount,
      avgRating,
      totalReviews: reviews.length
    };
  },

  // Multi-Barbearia (SaaS - Secao 12)
  getAllTenants() {
    const data = this.ensureSchema();
    return data.tenants || [];
  },

  switchTenant(newTenantId) {
    const tenants = this.getAllTenants();
    const target = tenants.find(t => t.id === newTenantId);
    if (!target) throw new Error('Barbearia não encontrada.');

    DB.tenantId = target.id;
    App.init();
    App.notify(`Alternado para: ${target.name} (Dados isolados SaaS)`);
  },

  createNewTenant({ name, phone, address }) {
    if (!name || name.trim().length < 3) throw new Error('Informe o nome da nova barbearia.');
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.floor(100 + Math.random() * 900);
    const data = this.ensureSchema();

    const newTenant = {
      id: slug,
      name: name.trim(),
      slug,
      phone: DB.normalizePhone(phone || '5511999999999'),
      address: (address || 'Endereço principal').trim(),
      bookingUrl: `https://${slug}.agendar.online`,
      adminPin: '1234',
      slotIntervalMinutes: 15,
      minAdvanceMinutes: 30,
      maxAdvanceDays: 30,
      createdAt: new Date().toISOString()
    };

    data.tenants.push(newTenant);

    // Cria horarios padrao para o novo estabelecimento (Secao 3.1 e Secao 12)
    const defaultDays = [
      { dayOfWeek: 0, dayName: 'Domingo', isOpen: false, openTime: '09:00', closeTime: '18:00', breakStart: '', breakEnd: '' },
      { dayOfWeek: 1, dayName: 'Segunda-feira', isOpen: false, openTime: '09:00', closeTime: '19:00', breakStart: '', breakEnd: '' },
      { dayOfWeek: 2, dayName: 'Terça-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 3, dayName: 'Quarta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 4, dayName: 'Quinta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 5, dayName: 'Sexta-feira', isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 6, dayName: 'Sábado', isOpen: true, openTime: '08:00', closeTime: '18:00', breakStart: '12:30', breakEnd: '13:30' }
    ];
    defaultDays.forEach(d => data.businessHours.push({ ...d, tenantId: slug }));

    // Cria servicos iniciais padrao para o novo estabelecimento
    [
      { name: 'Corte de cabelo', description: 'Corte completo com acabamento.', durationMinutes: 30, price: 35.00 },
      { name: 'Barba', description: 'Alinhamento com navalha e toalha quente.', durationMinutes: 20, price: 25.00 },
      { name: 'Cabelo + barba', description: 'Combo corte e barba.', durationMinutes: 50, price: 55.00 },
      { name: 'Sobrancelha', description: 'Acabamento na navalha.', durationMinutes: 15, price: 15.00 }
    ].forEach((s, idx) => {
      data.services.push({
        id: `srv-${slug}-${idx + 1}`,
        tenantId: slug,
        ...s,
        active: true
      });
    });

    DB.save(data);
    this.switchTenant(slug);
    return newTenant;
  },

  // ==========================================================================
  // 5. COMPONENTES DE UI DA FASE 3 (FINANCEIRO, FIDELIDADE, AVALIACOES E SAAS)
  // ==========================================================================
  renderClientLoyaltyAndReviewsBox(phone) {
    const clean = DB.normalizePhone(phone);
    if (!clean) return '';

    const loyalty = this.getClientLoyaltyStatus(clean);
    const stampsHtml = Array.from({ length: loyalty.goal }).map((_, idx) => {
      const filled = idx < loyalty.currentCycleStamps;
      return `
        <div class="h-9 rounded-lg border flex items-center justify-center text-xs font-bold ${
          filled
            ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow'
            : 'bg-zinc-950 text-zinc-600 border-zinc-800'
        }">
          ${filled ? '✂️' : idx + 1}
        </div>
      `;
    }).join('');

    return `
      <div class="p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/30 border border-amber-500/30 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span class="text-xs font-bold uppercase tracking-wider text-amber-400">🎁 Programa de Fidelidade (Seção 8.2)</span>
            <h3 class="text-base font-bold text-white mt-0.5">
              A cada ${loyalty.goal} atendimentos concluídos, você ganha 1 corte grátis!
            </h3>
          </div>
          ${loyalty.availableFreeCuts > 0 ? `
            <span class="px-3 py-1.5 rounded-xl bg-emerald-500 text-zinc-950 font-black text-xs animate-pulse">
              🎉 Você tem ${loyalty.availableFreeCuts} CORTE(S) GRÁTIS disponível!
            </span>
          ` : `
            <span class="text-xs text-zinc-300 bg-zinc-950/80 px-3 py-1.5 rounded-xl border border-zinc-800">
              Faltam <strong class="text-amber-400">${loyalty.remainingForNext}</strong> visitas para o próximo prêmio
            </span>
          `}
        </div>

        <div class="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-1">
          ${stampsHtml}
        </div>

        <div class="text-[11px] text-zinc-400 flex justify-between pt-1">
          <span>Total de visitas pagas: <strong class="text-zinc-200">${loyalty.completedPaid}</strong></span>
          <span>Prêmios já resgatados: <strong class="text-amber-400">${loyalty.redemptionsCount}</strong></span>
        </div>
      </div>
    `;
  },

  renderAdminFinanceAndReportsTab() {
    const refDate = App.state.adminSelectedDate || Scheduler.getTodayDateStr();
    const fin = this.getFinancialSummary(refDate);
    const metrics = this.getAdvancedMetrics();
    const txs = this.getTransactions();

    const methodLabels = {
      PIX: '⚡ PIX',
      CARTAO_CREDITO: '💳 Cartão de Crédito',
      CARTAO_DEBITO: '💳 Cartão de Débito',
      DINHEIRO: '💵 Dinheiro',
      FIDELIDADE_GRATIS: '🎁 Resgate Fidelidade (Grátis)'
    };

    return `
      <div class="space-y-6">
        <!-- Cards de Faturamento Efetivo: Diario, Semanal e Mensal (Secao 8.3) -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <span class="text-xs text-zinc-400">Caixa Efetivo do Dia (${App.formatDateBR(refDate)})</span>
            <div class="text-2xl font-bold text-emerald-400 mt-1">${App.formatCurrency(fin.dailyTotal)}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <span class="text-xs text-zinc-400">Faturamento Semanal (Últimos 7 dias)</span>
            <div class="text-2xl font-bold text-white mt-1">${App.formatCurrency(fin.weeklyTotal)}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <span class="text-xs text-zinc-400">Faturamento Mensal (${refDate.slice(0, 7)})</span>
            <div class="text-2xl font-bold text-amber-400 mt-1">${App.formatCurrency(fin.monthlyTotal)}</div>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <span class="text-xs text-zinc-400">Nota Média de Atendimento</span>
            <div class="text-2xl font-bold text-amber-300 mt-1">⭐ ${metrics.avgRating} <span class="text-xs text-zinc-400 font-normal">(${metrics.totalReviews} aval.)</span></div>
          </div>
        </div>

        <!-- Linha 2: Formas de Pagamento + Servicos Mais Procurados + Clientes Novos vs Recorrentes -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-white text-sm">💳 Receita Mensal por Forma de Pagamento</h3>
            <div class="space-y-2 text-xs">
              ${Object.entries(methodLabels).map(([key, label]) => `
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                  <span class="text-zinc-300">${label}</span>
                  <span class="font-bold text-white">${App.formatCurrency(fin.byMethod[key] || 0)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-white text-sm">🏆 Serviços Mais Procurados (Seção 7)</h3>
            ${metrics.topServices.length === 0 ? `
              <div class="text-xs text-zinc-500 py-4">Nenhum atendimento registrado ainda.</div>
            ` : `
              <div class="space-y-2 text-xs">
                ${metrics.topServices.map((s, i) => `
                  <div class="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                    <div>
                      <span class="font-bold text-amber-400 mr-1.5">#${i + 1}</span>
                      <span class="text-white font-semibold">${s.name}</span>
                    </div>
                    <div class="text-right">
                      <span class="text-zinc-300">${s.count} atend.</span>
                      <span class="text-emerald-400 font-bold ml-2">${App.formatCurrency(s.revenue)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-white text-sm">👥 Retenção & Clientes (Seção 7)</h3>
            <div class="space-y-2.5 text-xs">
              <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between">
                <span class="text-zinc-400">Clientes Novos (1ª visita):</span>
                <strong class="text-white text-sm">${metrics.newClientsCount}</strong>
              </div>
              <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between">
                <span class="text-zinc-400">Clientes Recorrentes (2+ visitas):</span>
                <strong class="text-emerald-400 text-sm">${metrics.recurringClientsCount}</strong>
              </div>
              <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 leading-relaxed">
                💡 <strong>Regra de Fidelidade Ativa:</strong> A cada <strong>${this.LOYALTY_GOAL} atendimentos pagos</strong>, o sistema libera automaticamente a opção de concluir o próximo corte como <em>Resgate Fidelidade (Grátis)</em>.
              </div>
            </div>
          </div>
        </div>

        <!-- Livro Caixa de Recebimentos -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <h3 class="font-bold text-white text-base">💰 Histórico de Recebimentos Registrados (${txs.length})</h3>
          ${txs.length === 0 ? `
            <div class="p-6 text-center text-zinc-500 text-xs">
              Conclua um agendamento na aba "Agenda" informando a forma de pagamento para registrar no caixa.
            </div>
          ` : `
            <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
              ${txs.map(t => `
                <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span class="font-mono text-amber-400 font-bold">${t.appointmentCode || ''}</span>
                    <span class="font-bold text-white ml-1.5">${t.clientName}</span>
                    <span class="text-zinc-400"> • ${t.serviceName} (${App.formatDateBR(t.date)})</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 font-semibold">${methodLabels[t.paymentMethod] || t.paymentMethod}</span>
                    <span class="font-bold text-sm text-emerald-400">${App.formatCurrency(t.amount)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  renderAdminReviewsAndSaaSTab() {
    const reviews = this.getReviews();
    const tenants = this.getAllTenants();
    const currentTenant = DB.getTenant();

    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Coluna 1: Avaliacoes dos Clientes (Secao 8.4) -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
          <div>
            <h3 class="font-bold text-white text-base">⭐ Avaliações de Atendimento (${reviews.length})</h3>
            <p class="text-xs text-zinc-400">Avaliações enviadas pelos clientes após a conclusão dos serviços (Seção 8.4).</p>
          </div>

          ${reviews.length === 0 ? `
            <div class="p-6 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-zinc-400 text-xs">
              Nenhuma avaliação registrada ainda. Assim que um atendimento é concluído, o cliente pode avaliá-lo na aba "Meus Horários".
            </div>
          ` : `
            <div class="space-y-2.5">
              ${reviews.map(r => `
                <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-white text-sm">${r.clientName}</span>
                    <span class="text-amber-400 font-bold text-sm">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  <div class="text-xs text-zinc-400">${r.serviceName} • ${App.formatDateBR(r.date)}</div>
                  ${r.comment ? `<p class="text-xs text-zinc-200 italic pt-1">"${r.comment}"</p>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Coluna 2: Multi-Barbearias / Arquitetura SaaS (Secao 12) -->
        <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400">Arquitetura SaaS Multi-Tenant (Seção 12)</span>
            <h3 class="font-bold text-white text-base mt-0.5">🏢 Gestão de Múltiplas Barbearias</h3>
            <p class="text-xs text-zinc-400">Cada estabelecimento possui agenda, serviços, clientes, financeiro e WhatsApp 100% isolados.</p>
          </div>

          <div class="space-y-2">
            <label class="block text-xs text-zinc-300 font-semibold">Barbearias Cadastradas (${tenants.length}):</label>
            ${tenants.map(t => {
              const isCurrent = t.id === currentTenant?.id;
              return `
                <div class="p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  isCurrent ? 'bg-amber-500/15 border-amber-500' : 'bg-zinc-950 border-zinc-800'
                }">
                  <div>
                    <div class="font-bold text-white text-sm">${t.name}</div>
                    <div class="text-xs text-zinc-400">${t.address} • ID: <code class="text-amber-400">${t.id}</code></div>
                  </div>
                  ${isCurrent ? `
                    <span class="px-3 py-1 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs">Ativa Agora</span>
                  ` : `
                    <button
                      type="button"
                      onclick="Phase3.switchTenant('${t.id}')"
                      class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
                    >
                      Acessar Unidade
                    </button>
                  `}
                </div>
              `;
            }).join('')}
          </div>

          <form onsubmit="Phase3.handleCreateTenant(event)" class="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <h4 class="text-xs font-bold text-amber-400 uppercase">➕ Cadastrar Nova Barbearia (Expansão SaaS)</h4>
            <div>
              <label class="block text-xs text-zinc-300 mb-1">Nome da Barbearia *</label>
              <input
                type="text"
                id="saas-tenant-name"
                required
                placeholder="Ex: Barbearia Barreto - Unidade 2"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label class="block text-xs text-zinc-300 mb-1">WhatsApp da Unidade</label>
                <input
                  type="tel"
                  id="saas-tenant-phone"
                  placeholder="(11) 99999-0000"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-300 mb-1">Endereço</label>
                <input
                  type="text"
                  id="saas-tenant-address"
                  placeholder="Av. Central, 500"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              class="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition"
            >
              Criar Nova Barbearia Isolada
            </button>
          </form>
        </div>
      </div>
    `;
  },

  handleCreateTenant(event) {
    event.preventDefault();
    try {
      const name = document.getElementById('saas-tenant-name')?.value;
      const phone = document.getElementById('saas-tenant-phone')?.value;
      const address = document.getElementById('saas-tenant-address')?.value;
      this.createNewTenant({ name, phone, address });
    } catch (err) {
      App.notify(err.message, 'error');
    }
  }
};
