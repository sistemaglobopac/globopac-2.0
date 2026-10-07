import { useEffect, useState } from "react";
import { temVerificadorLocal } from "@/lib/credencialOffline";
import { useOnline } from "@/lib/useOnline";
import { useSessionStore } from "@/store/session";

/** O inspetor está SEM internet e este aparelho ainda não tem o verificador da senha dele? Então a ficha entra na fila sem
 * pedir a senha (ver `conferirSenha`): as telas de confirmação avisam isso em vez de pedir uma senha que não dá para conferir. */
export function useSemVerificadorOffline(): boolean {
  const online = useOnline();
  const perfil = useSessionStore((s) => s.perfil);
  const [semVerificador, setSemVerificador] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (online || perfil?.nivelAcesso !== "INSPETOR_QUALIDADE") {
      setSemVerificador(false);
      return;
    }
    void temVerificadorLocal(perfil.id).then((tem) => {
      if (ativo) setSemVerificador(!tem);
    });
    return () => {
      ativo = false;
    };
  }, [online, perfil?.id, perfil?.nivelAcesso]);

  return semVerificador;
}
