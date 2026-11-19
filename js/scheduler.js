/**
 * Motor de Disponibilidade e Regras de Agendamento (Secao 3.2 do Escopo)
 * Integrado com Automacao WhatsApp e Lista de Espera da Fase 2 (Secoes 5, 6 e 8.1)
 */

window.Scheduler = {
  timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  },

  minutesToTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  addMinutesToTime(timeStr, minutesToAdd) {
    return this.minutesToTime(this.timeToMinutes(timeStr) + Number(minutesToAdd));
  },

  hasOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
  },

  getDayOfWeekFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getDay();
  },

  getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  getAvailableSlots(dateStr, serviceId, ignoreAppointmentId = null) {
    const service = DB.getServiceById(serviceId);
    if (!service || !service.active) {
      return { available: false, reason: 'Serviço inválido ou inativo.', slots: [] };
    }

    const tenant = DB.getTenant();
    const dayOfWeek = this.getDayOfWeekFromDateStr(dateStr);
    const businessHours = DB.getBusinessHours().find(bh => bh.dayOfWeek === dayOfWeek);

    if (!businessHours || !businessHours.isOpen) {
      return { available: false, reason: 'A barbearia está fechada neste dia da semana.', slots: [] };
    }

    const blocks = DB.getBlockedSlots(dateStr);
    const fullDayBlock = blocks.find(b => b.isFullDay);
    if (fullDayBlock) {
      return {
        available: false,
        reason: `Dia bloqueado: ${fullDayBlock.reason}`,
        slots: []
      };
    }

    const openMin = this.timeToMinutes(businessHours.openTime);
    const closeMin = this.timeToMinutes(businessHours.closeTime);
    const duration = Number(service.durationMinutes);
    const step = Number(tenant?.slotIntervalMinutes || 15);

    const hasBreak = Boolean(businessHours.breakStart && businessHours.breakEnd);
    const breakStartMin = hasBreak ? this.timeToMinutes(businessHours.breakStart) : -1;
    const breakEndMin = hasBreak ? this.timeToMinutes(businessHours.breakEnd) : -1;

    const activeAppointments = DB.getAppointments({ date: dateStr }).filter(
      a => a.status !== 'CANCELADO' && a.id !== ignoreAppointmentId
    );

    const todayStr = this.getTodayDateStr();
    if (dateStr < todayStr) {
      return { available: false, reason: 'Não é possível agendar em datas passadas.', slots: [] };
    }

    let minAllowedStartMin = 0;
    if (dateStr === todayStr) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      minAllowedStartMin = nowMinutes + Number(tenant?.minAdvanceMinutes || 15);
    }

    const slots = [];

    for (let startMin = openMin; startMin + duration <= closeMin; startMin += step) {
      const endMin = startMin + duration;

      if (dateStr === todayStr && startMin < minAllowedStartMin) {
        continue;
      }

      if (hasBreak && this.hasOverlap(startMin, endMin, breakStartMin, breakEndMin)) {
        continue;
      }

      const conflictsWithBlock = blocks.some(b => {
        const bStart = this.timeToMinutes(b.startTime);
        const bEnd = this.timeToMinutes(b.endTime);
        return this.hasOverlap(startMin, endMin, bStart, bEnd);
      });
      if (conflictsWithBlock) {
        continue;
      }

      const conflictsWithAppt = activeAppointments.some(a => {
        const aStart = this.timeToMinutes(a.startTime);
        const aEnd = this.timeToMinutes(a.endTime);
        return this.hasOverlap(startMin, endMin, aStart, aEnd);
      });
      if (conflictsWithAppt) {
        continue;
      }

      slots.push({
        startTime: this.minutesToTime(startMin),
        endTime: this.minutesToTime(endMin),
        label: this.minutesToTime(startMin)
      });
    }

    return {
      available: slots.length > 0,
      reason: slots.length === 0 ? 'Nenhum horário disponível para a duração deste serviço nesta data.' : '',
      slots
    };
  },

  createAppointment({ serviceId, date, startTime, clientName, clientPhone, clientEmail, notes, marketingConsent, createdBy = 'CLIENTE', waitlistId = null }) {
    const service = DB.getServiceById(serviceId);
    if (!service) {
      throw new Error('Selecione um serviço válido.');
    }
    if (!date || !startTime) {
      throw new Error('Selecione a data e o horário desejados.');
    }
    const cleanPhone = DB.normalizePhone(clientPhone);
    if (!clientName || clientName.trim().length < 2) {
      throw new Error('Informe seu nome completo.');
    }
    if (cleanPhone.length < 10) {
      throw new Error('Informe um número de celular/WhatsApp válido com DDD.');
    }

    const availability = this.getAvailableSlots(date, serviceId);
    const slotStillFree = availability.slots.find(s => s.startTime === startTime);
    if (!slotStillFree) {
      throw new Error('Este horário acabou de ficar indisponível ou conflita com outro atendimento. Por favor, escolha outro horário.');
    }

    const client = DB.upsertClient({
      name: clientName,
      phone: cleanPhone,
      email: clientEmail,
      marketingConsent
    });

    const data = DB.init();
    const newAppointment = {
      id: 'ag-' + Date.now(),
      code: 'BB-' + String(Math.floor(1000 + Math.random() * 9000)),
      tenantId: DB.tenantId,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      serviceId: service.id,
      serviceName: service.name,
      serviceDuration: service.durationMinutes,
      servicePrice: service.price,
      date,
      startTime: slotStillFree.startTime,
      endTime: slotStillFree.endTime,
      status: 'CONFIRMADO',
      notes: (notes || '').trim(),
      remindersSent: {},
      createdBy,
      createdAt: new Date().toISOString()
    };

    data.appointments.push(newAppointment);
    DB.save(data);

    if (waitlistId) {
      try {
        DB.updateWaitlistStatus(waitlistId, 'ATENDIDO');
      } catch (e) {
        // Ignora caso nao exista
      }
    }

    DB.logAudit(
      'AGENDAMENTO_CRIADO',
      `Agendamento ${newAppointment.code} (${createdBy}): ${newAppointment.clientName} - ${newAppointment.serviceName} em ${date} às ${startTime}`
    );

    // Fase 2 (Secao 6): Disparo automatico de confirmacao no WhatsApp
    const waCfg = DB.getWhatsAppConfig();
    if (waCfg.autoSendTransactional && window.WhatsAppService) {
      WhatsAppService.sendTransactional('CONFIRMATION', newAppointment, false);
    }

    return newAppointment;
  },

  updateAppointmentStatus(appointmentId, newStatus, actor = 'ADMIN') {
    const data = DB.init();
    const appt = data.appointments.find(a => a.id === appointmentId && a.tenantId === DB.tenantId);
    if (!appt) {
      throw new Error('Agendamento não encontrado.');
    }
    const oldStatus = appt.status;
    appt.status = newStatus;
    appt.updatedAt = new Date().toISOString();
    DB.save(data);
    DB.logAudit(
      'AGENDAMENTO_STATUS',
      `Agendamento ${appt.code} (${appt.clientName}) alterado de ${oldStatus} para ${newStatus} por ${actor}.`
    );

    const waCfg = DB.getWhatsAppConfig();
    let matchingWaitlist = [];

    if (newStatus === 'CANCELADO') {
      if (waCfg.autoSendTransactional && window.WhatsAppService) {
        WhatsAppService.sendTransactional('CANCELLATION', appt, false);
      }
      // Fase 2 (Secao 8.1): Verifica se ha clientes na Lista de Espera para a data liberada
      matchingWaitlist = DB.getWaitlist({ date: appt.date, status: 'AGUARDANDO' });
    }

    return { appointment: appt, matchingWaitlist };
  },

  rescheduleAppointment(appointmentId, newDate, newStartTime, actor = 'CLIENTE') {
    const data = DB.init();
    const appt = data.appointments.find(a => a.id === appointmentId && a.tenantId === DB.tenantId);
    if (!appt) {
      throw new Error('Agendamento não encontrado.');
    }

    const availability = this.getAvailableSlots(newDate, appt.serviceId, appt.id);
    const validSlot = availability.slots.find(s => s.startTime === newStartTime);
    if (!validSlot) {
      throw new Error('O novo horário selecionado não está disponível.');
    }

    const oldDate = appt.date;
    const oldInfo = `${appt.date} às ${appt.startTime}`;
    appt.date = newDate;
    appt.startTime = validSlot.startTime;
    appt.endTime = validSlot.endTime;
    appt.status = 'CONFIRMADO';
    appt.updatedAt = new Date().toISOString();

    DB.save(data);
    DB.logAudit(
      'AGENDAMENTO_ALTERADO',
      `Agendamento ${appt.code} (${appt.clientName}) remarcado de ${oldInfo} para ${newDate} às ${newStartTime} por ${actor}.`
    );

    const waCfg = DB.getWhatsAppConfig();
    if (waCfg.autoSendTransactional && window.WhatsAppService) {
      WhatsAppService.sendTransactional('RESCHEDULE', appt, false);
    }

    const matchingWaitlist = DB.getWaitlist({ date: oldDate, status: 'AGUARDANDO' });
    return { appointment: appt, matchingWaitlist };
  }
};
