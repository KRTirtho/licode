import crypto, { BinaryLike } from "crypto";
import path from "path"
import fetch, { Headers } from "node-fetch"

export interface NuveClientOptions {
  service: string;
  key: BinaryLike;
  url: string;
}

export interface Room {
  name: string,
  _id: string,
  p2p: boolean,
  mediaConfiguration: string,
  data: Record<string, string>,
}

export interface User {
  name: string,
  role: string,
}

class NuveClient {
  constructor(public params: NuveClientOptions) { }

  private formatString(s: string) {
    let r = s.toLowerCase();
    const nonAsciis = {
      'a': '[àáâãäå]',
      'ae': 'æ',
      'c': 'ç',
      'e': '[èéêë]',
      'i': '[ìíîï]',
      'n': 'ñ',
      'o': '[òóôõö]',
      'oe': 'œ',
      'u': '[ùúûűü]',
      'y': '[ýÿ]'
    };
    for (const [key, val] of Object.entries(nonAsciis)) {
      r = r.replace(new RegExp(val, 'g'), key);
    }
    return r;
  }

  createRoom(name: string, options: Object = {}, params?: Partial<NuveClientOptions>) {
    return this.send('POST', 'rooms', { name, options }, params);
  }

  getRooms(params?: Partial<NuveClientOptions>) {
    return this.send('GET', 'rooms', null, params);
  }

  getRoom(
    room: string,
    params?: Partial<NuveClientOptions>
  ) {
    return this.send('GET', 'rooms/' + room, null, params);
  }

  updateRoom(room: string, name?: string, options?: Partial<NuveClientOptions>, params?: Partial<NuveClientOptions>) {
    return this.send('PUT', 'rooms/' + room, { name, options }, params);
  }

  patchRoom(room: string, name?: string, options?: Partial<NuveClientOptions>, params?: Partial<NuveClientOptions>) {
    return this.send('PATCH', 'rooms/' + room, { name, options }, params);
  }

  deleteRoom(room: string, params?: Partial<NuveClientOptions>) {
    return this.send('DELETE', 'rooms/' + room, null, params);
  }

  createToken(room: string, username: string, role: string, params?: Partial<NuveClientOptions>) {
    return this.send(
      'POST',
      'rooms/' + room + '/tokens',
      null,
      params,
      username,
      role
    );
  }

  createService(name: string, key: BinaryLike, params?: Partial<NuveClientOptions>) {
    return this.send('POST', 'services/', { name, key }, params);
  }

  getServices(params?: Partial<NuveClientOptions>) {
    return this.send('GET', 'services/', null, params);
  }

  getService(service: string, params?: Partial<NuveClientOptions>) {
    return this.send('GET', 'services/' + service, null, params);
  }

  deleteService(service: string, params?: Partial<NuveClientOptions>) {
    return this.send('DELETE', 'services/' + service, null, params);
  }

  getUsers(room: string, params?: Partial<NuveClientOptions>) {
    return this.send('GET', 'rooms/' + room + '/users/', null, params);
  }

  getUser(room: string, user: string, params?: Partial<NuveClientOptions>) {
    return this.send('GET', 'rooms/' + room + '/users/' + user, null, params);
  }

  deleteUser(
    room: string,
    user: string,
    params?: Partial<NuveClientOptions>
  ) {
    return this.send(
      'DELETE',
      'rooms/' + room + '/users/' + user,
      null,
      params
    );
  }


  private calculateSignature(toSign: BinaryLike, key: BinaryLike) {
    var hex = crypto.createHmac('sha1', key)
      .update(toSign)
      .digest('hex');
    return Buffer.from(hex).toString('base64');
  }

  private async send<T extends Record<any, any> | null | undefined, B = Record<any, any>>(method: string = "GET", url?: string, body?: B, params?: Partial<NuveClientOptions> | null, username?: string, role?: string): Promise<T | void> {
    let service: string = params?.service ?? this.params.service;
    let key: BinaryLike = params?.key ?? this.params.key;
    url = path.join(params?.url ?? this.params.url, url ?? "")


    if (!service || !key) {
      console.log('ServiceID and Key are required!!');
      return;
    }

    const timestamp = new Date().getTime();
    const cnounce = Math.floor(Math.random() * 99999);

    let toSign = timestamp + ',' + cnounce;

    let header = 'MAuth realm=http://marte3.dit.upm.es,mauth_signature_method=HMAC_SHA1';

    if (username && role) {

      username = this.formatString(username);

      header += ',mauth_username=';
      header += username;
      header += ',mauth_role=';
      header += role;

      toSign += ',' + username + ',' + role;
    }

    const signed = this.calculateSignature(toSign, key);


    header += ',mauth_serviceid=';
    header += service;
    header += ',mauth_cnonce=';
    header += cnounce;
    header += ',mauth_timestamp=';
    header += timestamp;
    header += ',mauth_signature=';
    header += signed;

    const headers = new Headers()

    headers.set("Authorization", header)

    if (body) {
      headers.set('Content-Type', 'application/json')
    }

    const res = await fetch(url, { method, body: body ? JSON.stringify(body) : null, headers })

    const json: T = (await res.json()) as T;

    if (res.status === 205) return json
    else if ([100, 200, 201, 202, 203, 204].includes(res.status)) return
    else {
      throw new Error(JSON.stringify({ status: res.status, responseBody: json }));
    }
  }
}

export default NuveClient;