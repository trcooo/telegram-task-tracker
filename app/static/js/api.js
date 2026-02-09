const API = {
  token: null,

  async authTelegram(initData){
    const r = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({init_data: initData})
    });
    if(!r.ok) throw new Error("Auth failed");
    const j = await r.json();
    this.token = j.token;
    return j;
  },

  async getProjects(){
    return this._get("/api/projects");
  },

  async setTimezone(timezone){
    return this._patch("/api/user/timezone", {timezone});
  },
  async createProject(name, color){
    return this._post("/api/projects", {name, color});
  },

  async listTasks(filter="inbox"){
    return this._get(`/api/tasks?filter=${encodeURIComponent(filter)}`);
  },
  async createTask(body){
    return this._post("/api/tasks", body);
  },
  async updateTask(id, body){
    return this._patch(`/api/tasks/${id}`, body);
  },
  async completeTask(id){
    return this._post(`/api/tasks/${id}/complete`, {});
  },
  async deleteTask(id){
    return this._delete(`/api/tasks/${id}`);
  },

  async scheduleDay(dateStr){
    return this._get(`/api/schedule/day?date_str=${encodeURIComponent(dateStr)}`);
  },

  async scheduleRange(startDate, endDate){
    return this._get(`/api/schedule/range?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`);
  },
  async createEvent(body){
    return this._post("/api/events", body);
  },
  async updateEvent(id, body){
    return this._patch(`/api/events/${id}`, body);
  },
  async deleteEvent(id){
    return this._delete(`/api/events/${id}`);
  },

  async planTask(taskId, startDtISO, durationMin){
    return this._post(`/api/tasks/${taskId}/plan`, {start_dt: startDtISO, duration_min: durationMin});
  },

  _headers(){
    const h = {"Content-Type":"application/json"};
    if(this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  },
  async _get(url){
    const r = await fetch(url, {headers: this._headers()});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async _post(url, body){
    const r = await fetch(url, {method:"POST", headers:this._headers(), body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async _patch(url, body){
    const r = await fetch(url, {method:"PATCH", headers:this._headers(), body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async _delete(url){
    const r = await fetch(url, {method:"DELETE", headers:this._headers()});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
};
