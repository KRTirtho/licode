import crypto, { BinaryLike } from "crypto";
import path from "path"
import { XMLHttpRequest } from "w3c-xmlhttprequest"

export interface NuveClientOptions {
  service: string;
  key: BinaryLike;
  url: string;
}

export interface Room{
  name: string,
  _id: string,
  p2p: boolean,
  mediaConfiguration: string,
  data: Record<string, string>,
}

export interface User{
  name: string,
  role: string,
}

type ErrCallback = (err: string, status: number) => void;

type ResCallback<T=string> = (resText: T) => void;

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

  createRoom(name: string, callback?: ResCallback<Room>, callbackError?: ErrCallback, options: Object = {}, params?: Partial<NuveClientOptions>) {
    this.send(function (roomRtn) {
      const room: Room = JSON.parse(roomRtn);
      callback?.(room);
    }, callbackError, 'POST', { name, options }, 'rooms', params);
  }

  getRooms(callback?: ResCallback<Room[]>, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'GET', undefined, 'rooms', params);
  }

  getRoom(
    room: string,
    callback?: ResCallback<Room>,
    callbackError?: ErrCallback,
    params?: Partial<NuveClientOptions>
  ) {
    this.send(callback, callbackError, 'GET', undefined, 'rooms/' + room, params);
  }

  updateRoom(room: string, name?: string, callback?: ResCallback<Room>, callbackError?: ErrCallback, options?: Partial<NuveClientOptions>, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'PUT', { name: name, options: options },
      'rooms/' + room, params);
  }

  patchRoom(room: string, name?: string, callback?: ResCallback<Room>, callbackError?: ErrCallback, options?: Partial<NuveClientOptions>, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'PATCH', { name: name, options: options },
      'rooms/' + room, params);
  }

  deleteRoom(room: string, callback?: ResCallback<Room>, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'DELETE', undefined, 'rooms/' + room, params);
  }

  createToken(room: string, username: string, role: string, callback?: ResCallback, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'POST', undefined, 'rooms/' + room + '/tokens',
      params, username, role);
  }

  createService(name: string, key: BinaryLike, callback?: ResCallback, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'POST', { name: name, key: key }, 'services/', params);
  }

  getServices(callback?: ResCallback, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'GET', undefined, 'services/', params);
  }

  getService(service: string, callback?: ResCallback, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'GET', undefined, 'services/' + service, params);
  }

  deleteService(service: string, callback?: ResCallback, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'DELETE', undefined, 'services/' + service, params);
  }

  getUsers(room: string, callback?: ResCallback<User[]>, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'GET', undefined, 'rooms/' + room + '/users/', params);
  }

  getUser(room: string, user: string, callback?: ResCallback<User>, callbackError?: ErrCallback, params?: Partial<NuveClientOptions>) {
    this.send(callback, callbackError, 'GET', undefined, 'rooms/' + room + '/users/' + user, params);
  }

  deleteUser(
    room: string,
    user: string,
    callback?: ResCallback<User>,
    callbackError?: ErrCallback,
    params?: Partial<NuveClientOptions>
  ) {
    this.send(
      callback,
      callbackError,
      'DELETE',
      undefined,
      'rooms/' + room + '/users/' + user, params
    );
  }


  private calculateSignature(toSign: BinaryLike, key: BinaryLike) {
    var hex = crypto.createHmac('sha1', key)
      .update(toSign)
      .digest('hex');
    return Buffer.from(hex).toString('base64');
  }

  private send<T=string>(callback?: ResCallback<T>, callbackError?: ErrCallback, method?: string, body?: Record<any, any>, url?: string, params?: Partial<NuveClientOptions> | null, username?: string, role?: string) {
    let service: string, key: BinaryLike;

    if (!params) {
      service = this.params.service;
      key = this.params.key;
      url = this.params.url + url;
    } else {
      service = params.service ?? "";
      key = params.key ?? "";
      url = path.join(params.url ?? this.params.url, url ?? "");
    }


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

    const req = new XMLHttpRequest();

    req.onreadystatechange = () => {
      if (req.readyState === 4) {
        switch (req.status) {
          case 100:
          case 200:
          case 201:
          case 202:
          case 203:
          case 204:
          case 205:
            callback?.(req.responseText);
            break;
          default:
            if (callbackError !== undefined) {
              callbackError(req.status + ' Error' + req.responseText, req.status);
            }
        }
      }
    };

    req.open(method, url, true);

    req.setRequestHeader('Authorization', header);

    if (body !== undefined) {
      req.setRequestHeader('Content-Type', 'application/json');
      req.send(JSON.stringify(body));
    } else {
      req.send();
    }

  }
}

export default NuveClient;